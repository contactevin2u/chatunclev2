/**
 * Buffered Event Handler for Baileys
 *
 * Implements sock.ev.process() for batch event processing instead of
 * individual sock.ev.on() listeners. This provides:
 *
 * 1. REDUCED OVERHEAD: Events are batched and delivered together
 * 2. ATOMIC PROCESSING: Related events processed in single callback
 * 3. BETTER ORDERING: Events within a batch maintain proper sequence
 * 4. PARALLEL PROCESSING: Messages processed in parallel batches
 *
 * Based on official Baileys documentation and best practices.
 */

import {
  WASocket,
  proto,
  BaileysEventMap,
  isJidBroadcast,
  isJidGroup,
  isLidUser,
  isPnUser,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { query, queryOne, execute } from '../../config/database';
import { getIO } from '../socket';
import { messageStore } from './MessageStore';
import { groupMetadataCache } from './GroupMetadataCache';
import { messageDeduplicator } from './MessageDeduplicator';
import { healthMonitor } from './HealthMonitor';
import { sleep } from '../antiBan';
import {
  batchInsertContacts,
  batchInsertMessages,
  batchInsertGroupParticipants,
} from '../../config/batchOperations';

// Helper functions
function isUserJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return isLidUser(jid) === true || isPnUser(jid) === true;
}

function extractUserIdFromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '');
}

function getJidType(jid: string): 'lid' | 'pn' {
  return isLidUser(jid) === true ? 'lid' : 'pn';
}

function extractGroupId(groupJid: string): string {
  return groupJid.replace('@g.us', '');
}

// Types for event processing
interface ProcessingContext {
  accountId: string;
  userId: string;
  sock: WASocket;
  saveCreds: () => Promise<void>;
  onReconnect: () => void;
  onLogout: () => void;
  onReady: () => void;
  setReady: (ready: boolean) => void;
}

/**
 * Message processing batch configuration
 */
const BATCH_CONFIG = {
  // Number of messages to process in parallel
  MESSAGE_BATCH_SIZE: 10,
  // Number of contacts to batch insert
  CONTACT_BATCH_SIZE: 50,
  // Delay between batches (ms) for anti-ban
  BATCH_DELAY_MS: 100,
};

/**
 * Process messages.upsert event with parallel batching
 */
async function processMessagesUpsert(
  ctx: ProcessingContext,
  upsert: BaileysEventMap['messages.upsert'],
  handlers: {
    handleIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
  }
): Promise<void> {
  const { messages, type } = upsert;
  const { accountId, userId } = ctx;
  const isRealTime = type === 'notify';

  console.log(`[WA][Buffered] messages.upsert - type: ${type}, count: ${messages.length}`);

  // Record health activity
  healthMonitor.recordMessageReceived(accountId);

  // PRE-WARM: Store all messages in MessageStore FIRST
  // Critical for getMessage callback and decryption retries
  for (const msg of messages) {
    if (msg.key && msg.message) {
      messageStore.store(accountId, msg.key, msg.message);
    }
  }

  // Filter and deduplicate messages
  const validMessages = messages.filter(msg => {
    if (!msg.key) return false;
    const messageId = msg.key.id;
    if (!messageId) return false;

    // Check deduplication
    if (messageDeduplicator.checkAndMark(accountId, messageId)) {
      console.log(`[WA][Buffered] Skipping duplicate: ${messageId}`);
      return false;
    }

    // Skip broadcasts
    if (!msg.key.remoteJid || isJidBroadcast(msg.key.remoteJid)) {
      return false;
    }

    return true;
  });

  if (validMessages.length === 0) return;

  // Separate group and 1:1 messages
  const groupMessages = validMessages.filter(msg => isJidGroup(msg.key!.remoteJid!));
  const userMessages = validMessages.filter(msg =>
    !isJidGroup(msg.key!.remoteJid!) && isUserJid(msg.key!.remoteJid!)
  );

  // Process in parallel batches
  const processBatch = async (batch: proto.IWebMessageInfo[], isGroup: boolean) => {
    await Promise.allSettled(batch.map(async (msg) => {
      try {
        const fromMe = msg.key!.fromMe;
        if (isGroup) {
          if (fromMe) {
            // Check if already saved
            const existing = await queryOne(
              'SELECT id FROM messages WHERE wa_message_id = $1',
              [msg.key!.id]
            );
            if (existing) {
              await execute(
                `UPDATE messages SET status = 'sent', updated_at = NOW() WHERE wa_message_id = $1`,
                [msg.key!.id]
              );
            } else {
              await handlers.handleGroupOutgoingMessage(accountId, userId, msg, isRealTime);
            }
          } else {
            await handlers.handleGroupIncomingMessage(accountId, userId, msg, isRealTime);
          }
        } else {
          if (fromMe) {
            const existing = await queryOne(
              'SELECT id FROM messages WHERE wa_message_id = $1',
              [msg.key!.id]
            );
            if (existing) {
              await execute(
                `UPDATE messages SET status = 'sent', updated_at = NOW() WHERE wa_message_id = $1`,
                [msg.key!.id]
              );
            } else {
              await handlers.handleOutgoingMessage(accountId, userId, msg, isRealTime);
            }
          } else {
            await handlers.handleIncomingMessage(accountId, userId, msg, isRealTime);
          }
        }
      } catch (error) {
        console.error(`[WA][Buffered] Error processing message ${msg.key?.id}:`, error);
      }
    }));
  };

  // Process user messages in parallel batches
  for (let i = 0; i < userMessages.length; i += BATCH_CONFIG.MESSAGE_BATCH_SIZE) {
    const batch = userMessages.slice(i, i + BATCH_CONFIG.MESSAGE_BATCH_SIZE);
    await processBatch(batch, false);
    if (i + BATCH_CONFIG.MESSAGE_BATCH_SIZE < userMessages.length) {
      await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
    }
  }

  // Process group messages in parallel batches
  for (let i = 0; i < groupMessages.length; i += BATCH_CONFIG.MESSAGE_BATCH_SIZE) {
    const batch = groupMessages.slice(i, i + BATCH_CONFIG.MESSAGE_BATCH_SIZE);
    await processBatch(batch, true);
    if (i + BATCH_CONFIG.MESSAGE_BATCH_SIZE < groupMessages.length) {
      await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
    }
  }

  console.log(`[WA][Buffered] Processed ${userMessages.length} user + ${groupMessages.length} group messages`);
}

/**
 * Process messages.update (status changes) in batch
 */
async function processMessagesUpdate(
  ctx: ProcessingContext,
  updates: BaileysEventMap['messages.update']
): Promise<void> {
  const { accountId, userId } = ctx;

  // Batch status updates for efficiency
  const statusUpdates: Array<{ waMessageId: string; status: string }> = [];

  for (const update of updates) {
    const waMessageId = update.key.id;
    const newStatus = update.update.status;

    if (newStatus !== undefined && newStatus !== null && waMessageId) {
      const statusStr = mapMessageStatus(newStatus as number);
      statusUpdates.push({ waMessageId, status: statusStr });
    }
  }

  if (statusUpdates.length === 0) return;

  // Process updates in parallel
  const results = await Promise.allSettled(statusUpdates.map(async ({ waMessageId, status }) => {
    const updatedMsg = await queryOne(
      `UPDATE messages SET status = $1, updated_at = NOW()
       WHERE wa_message_id = $2
       RETURNING id, conversation_id`,
      [status, waMessageId]
    );

    if (updatedMsg) {
      const io = getIO();
      io.to(`user:${userId}`).emit('message:status', {
        accountId,
        messageId: updatedMsg.id,
        waMessageId,
        conversationId: updatedMsg.conversation_id,
        status,
      });
    }

    return updatedMsg;
  }));

  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[WA][Buffered] Updated ${successful}/${statusUpdates.length} message statuses`);
}

/**
 * Process messaging-history.set with batch operations
 */
async function processHistorySync(
  ctx: ProcessingContext,
  historyData: BaileysEventMap['messaging-history.set'],
  handlers: {
    handleIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
  }
): Promise<void> {
  const { chats, contacts, messages, isLatest, progress, syncType } = historyData as any;
  const { accountId, userId, sock } = ctx;

  console.log(`[WA][Buffered] messaging-history.set:`);
  console.log(`  - chats: ${chats?.length || 0}`);
  console.log(`  - contacts: ${contacts?.length || 0}`);
  console.log(`  - messages: ${messages?.length || 0}`);
  console.log(`  - syncType: ${syncType}`);

  // BATCH PROCESS CONTACTS
  if (contacts && contacts.length > 0) {
    const contactBatch: Array<{
      whatsapp_account_id: string;
      wa_id: string;
      phone_number: string | null;
      name: string | null;
      jid_type: 'lid' | 'pn';
    }> = [];

    for (const contact of contacts) {
      if (!contact.id || !isUserJid(contact.id)) continue;

      const waId = extractUserIdFromJid(contact.id);
      const jidType = getJidType(contact.id);
      const phoneNumber = jidType === 'pn' ? waId : null;

      contactBatch.push({
        whatsapp_account_id: accountId,
        wa_id: waId,
        phone_number: phoneNumber,
        name: contact.name || contact.notify || null,
        jid_type: jidType,
      });

      // Batch insert every N contacts
      if (contactBatch.length >= BATCH_CONFIG.CONTACT_BATCH_SIZE) {
        await batchInsertContacts(contactBatch);
        contactBatch.length = 0;
      }
    }

    // Insert remaining contacts
    if (contactBatch.length > 0) {
      await batchInsertContacts(contactBatch);
    }

    console.log(`[WA][Buffered] Batch processed ${contacts.length} contacts`);
  }

  // PROCESS GROUPS FROM CHATS (parallel with rate limiting)
  if (chats && chats.length > 0) {
    const groupChats = chats.filter((chat: any) => chat.id && isJidGroup(chat.id));
    const GROUP_PARALLEL_LIMIT = 3;

    for (let i = 0; i < groupChats.length; i += GROUP_PARALLEL_LIMIT) {
      const batch = groupChats.slice(i, i + GROUP_PARALLEL_LIMIT);

      await Promise.allSettled(batch.map(async (chat: any) => {
        try {
          const chatJid = chat.id;

          // Try to fetch metadata
          let metadata: any = null;
          try {
            metadata = await sock.groupMetadata(chatJid);
          } catch {
            // Metadata fetch failed, use minimal data
          }

          // Upsert group
          const group = await queryOne(
            `INSERT INTO groups (whatsapp_account_id, group_jid, name, description, owner_jid, participant_count, is_announce, is_restrict)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (whatsapp_account_id, group_jid) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, groups.name),
               updated_at = NOW()
             RETURNING *`,
            [
              accountId,
              chatJid,
              metadata?.subject || chat.name || extractGroupId(chatJid),
              metadata?.desc || null,
              metadata?.owner || null,
              metadata?.participants?.length || 0,
              metadata?.announce || false,
              metadata?.restrict || false,
            ]
          );

          // Create conversation
          await queryOne(
            `INSERT INTO conversations (whatsapp_account_id, group_id, is_group, last_message_at)
             VALUES ($1, $2, TRUE, COALESCE($3, NOW()))
             ON CONFLICT (whatsapp_account_id, group_id) WHERE group_id IS NOT NULL DO NOTHING
             RETURNING *`,
            [accountId, group.id, chat.conversationTimestamp ? new Date(Number(chat.conversationTimestamp) * 1000) : null]
          );

          // Batch insert participants
          if (metadata?.participants && metadata.participants.length > 0) {
            const participantBatch = metadata.participants.map((p: any) => ({
              participant_jid: typeof p === 'string' ? p : p.id,
              is_admin: typeof p === 'object' && (p.admin === 'admin' || p.admin === 'superadmin'),
              is_superadmin: typeof p === 'object' && p.admin === 'superadmin',
            }));
            await batchInsertGroupParticipants(group.id, participantBatch);
          }

          // Cache metadata
          if (metadata) {
            groupMetadataCache.set(accountId, chatJid, metadata);
          }
        } catch (error) {
          console.error(`[WA][Buffered] Error processing group:`, error);
        }
      }));

      // Rate limit between batches
      if (i + GROUP_PARALLEL_LIMIT < groupChats.length) {
        await sleep(500);
      }
    }

    console.log(`[WA][Buffered] Processed ${groupChats.length} groups`);
  }

  // PROCESS MESSAGES (parallel batches)
  if (messages && messages.length > 0) {
    let processedCount = 0;

    for (let i = 0; i < messages.length; i += BATCH_CONFIG.MESSAGE_BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_CONFIG.MESSAGE_BATCH_SIZE);

      await Promise.allSettled(batch.map(async (msg: proto.IWebMessageInfo) => {
        if (!msg.key) return;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || isJidBroadcast(remoteJid)) return;

        try {
          // Check if already exists
          const existing = await queryOne(
            'SELECT id FROM messages WHERE wa_message_id = $1',
            [msg.key.id]
          );
          if (existing) return;

          if (isJidGroup(remoteJid)) {
            if (msg.key.fromMe) {
              await handlers.handleGroupOutgoingMessage(accountId, userId, msg, false);
            } else {
              await handlers.handleGroupIncomingMessage(accountId, userId, msg, false);
            }
          } else if (isUserJid(remoteJid)) {
            if (msg.key.fromMe) {
              await handlers.handleOutgoingMessage(accountId, userId, msg, false);
            } else {
              await handlers.handleIncomingMessage(accountId, userId, msg, false);
            }
          }
          processedCount++;
        } catch (error) {
          // Silently ignore duplicates
          if (!(error as any)?.message?.includes('duplicate')) {
            console.error(`[WA][Buffered] History message error:`, error);
          }
        }
      }));

      // Small delay between batches
      if (i + BATCH_CONFIG.MESSAGE_BATCH_SIZE < messages.length) {
        await sleep(50);
      }
    }

    console.log(`[WA][Buffered] Processed ${processedCount} history messages`);
  }

  // Emit sync progress
  const io = getIO();
  io.to(`user:${userId}`).emit('sync:progress', {
    accountId,
    progress: progress || 100,
    isLatest,
    chatsCount: chats?.length || 0,
    messagesCount: messages?.length || 0,
  });
}

/**
 * Process contacts.upsert in batch
 */
async function processContactsUpsert(
  ctx: ProcessingContext,
  contacts: BaileysEventMap['contacts.upsert']
): Promise<void> {
  const { accountId } = ctx;

  const contactBatch: Array<{
    whatsapp_account_id: string;
    wa_id: string;
    phone_number: string | null;
    name: string | null;
    jid_type: 'lid' | 'pn';
  }> = [];

  for (const contact of contacts) {
    if (!contact.id || !isUserJid(contact.id)) continue;

    const waId = extractUserIdFromJid(contact.id);
    const jidType = getJidType(contact.id);
    const phoneNumber = jidType === 'pn' ? waId : null;

    contactBatch.push({
      whatsapp_account_id: accountId,
      wa_id: waId,
      phone_number: phoneNumber,
      name: contact.name || contact.notify || null,
      jid_type: jidType,
    });
  }

  if (contactBatch.length > 0) {
    await batchInsertContacts(contactBatch);
    console.log(`[WA][Buffered] Batch inserted ${contactBatch.length} contacts`);
  }
}

/**
 * Map Baileys status code to string
 */
function mapMessageStatus(status: number): string {
  switch (status) {
    case 0: return 'pending';
    case 1: return 'sent';
    case 2: return 'delivered';
    case 3:
    case 4: return 'read';
    default: return 'sent';
  }
}

/**
 * Main function to setup buffered event processing
 * Replaces all sock.ev.on() calls with single sock.ev.process()
 */
export function setupBufferedEventProcessing(
  ctx: ProcessingContext,
  handlers: {
    handleIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupIncomingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleGroupOutgoingMessage: (accountId: string, userId: string, msg: proto.IWebMessageInfo, isRealTime: boolean) => Promise<void>;
    handleReaction: (accountId: string, userId: string, reaction: any) => Promise<void>;
    handleGroupUpsert: (accountId: string, userId: string, metadata: any) => Promise<void>;
    handleGroupUpdate: (accountId: string, userId: string, update: any) => Promise<void>;
    handleGroupParticipantsUpdate: (accountId: string, userId: string, update: any) => Promise<void>;
    handleLidMapping: (accountId: string, mappings: Record<string, any>) => Promise<void>;
  }
): void {
  const { sock, accountId, userId, saveCreds, onReconnect, onLogout, onReady, setReady } = ctx;

  console.log(`[WA][Buffered] Setting up buffered event processing for ${accountId}`);

  // Use sock.ev.process for batched event handling
  sock.ev.process(async (events) => {
    // ============ CREDENTIALS ============
    if (events['creds.update']) {
      await saveCreds();
    }

    // ============ CONNECTION ============
    if (events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect, qr } = update;

      console.log(`[WA][Buffered] Connection update:`, { connection, hasQR: !!qr });
      const io = getIO();

      if (qr) {
        io.to(`user:${userId}`).emit('qr:update', { accountId, qr });
        await execute(
          "UPDATE whatsapp_accounts SET status = 'qr_pending', updated_at = NOW() WHERE id = $1",
          [accountId]
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WA][Buffered] Connection closed. Code: ${statusCode}, reconnect: ${shouldReconnect}`);

        setReady(false);
        await execute(
          "UPDATE whatsapp_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1",
          [accountId]
        );
        io.to(`user:${userId}`).emit('account:status', { accountId, status: 'disconnected' });

        if (shouldReconnect) {
          onReconnect();
        } else {
          onLogout();
        }
      }

      if (connection === 'open') {
        console.log(`[WA][Buffered] Session ${accountId} connected!`);

        const phoneNumber = sock.user?.id?.split(':')[0] || null;
        const name = sock.user?.name || null;

        await execute(
          "UPDATE whatsapp_accounts SET status = 'connected', phone_number = COALESCE($1, phone_number), name = COALESCE($2, name), updated_at = NOW() WHERE id = $3",
          [phoneNumber, name, accountId]
        );

        io.to(`user:${userId}`).emit('account:status', {
          accountId,
          status: 'connected',
          phoneNumber,
          name,
        });

        setReady(true);
        onReady();
        healthMonitor.startMonitoring(accountId, sock);
      }
    }

    // ============ MESSAGES ============
    if (events['messages.upsert']) {
      await processMessagesUpsert(ctx, events['messages.upsert'], handlers);
    }

    if (events['messages.update']) {
      await processMessagesUpdate(ctx, events['messages.update']);
    }

    if (events['messages.reaction']) {
      for (const reaction of events['messages.reaction']) {
        try {
          await handlers.handleReaction(accountId, userId, reaction);
        } catch (error) {
          console.error(`[WA][Buffered] Reaction error:`, error);
        }
      }
    }

    // ============ HISTORY SYNC ============
    if (events['messaging-history.set']) {
      await processHistorySync(ctx, events['messaging-history.set'], handlers);
    }

    // ============ CONTACTS ============
    if (events['contacts.upsert']) {
      await processContactsUpsert(ctx, events['contacts.upsert']);
    }

    // ============ GROUPS ============
    if (events['groups.upsert']) {
      for (const metadata of events['groups.upsert']) {
        try {
          await handlers.handleGroupUpsert(accountId, userId, metadata);
        } catch (error) {
          console.error(`[WA][Buffered] Group upsert error:`, error);
        }
      }
    }

    if (events['groups.update']) {
      for (const update of events['groups.update']) {
        try {
          await handlers.handleGroupUpdate(accountId, userId, update);
        } catch (error) {
          console.error(`[WA][Buffered] Group update error:`, error);
        }
      }
    }

    if (events['group-participants.update']) {
      try {
        await handlers.handleGroupParticipantsUpdate(accountId, userId, events['group-participants.update']);
      } catch (error) {
        console.error(`[WA][Buffered] Participants update error:`, error);
      }
    }

    // ============ LID MAPPING ============
    if (events['lid-mapping.update']) {
      try {
        await handlers.handleLidMapping(accountId, events['lid-mapping.update']);
      } catch (error) {
        console.error(`[WA][Buffered] LID mapping error:`, error);
      }
    }

    // ============ CHATS (logging only) ============
    if (events['chats.upsert']) {
      console.log(`[WA][Buffered] chats.upsert: ${events['chats.upsert'].length}`);
    }
    if (events['chats.update']) {
      console.log(`[WA][Buffered] chats.update: ${events['chats.update'].length}`);
    }
    if (events['contacts.update']) {
      console.log(`[WA][Buffered] contacts.update: ${events['contacts.update'].length}`);
    }
  });

  console.log(`[WA][Buffered] Event processing setup complete for ${accountId}`);
}

export { BATCH_CONFIG };
