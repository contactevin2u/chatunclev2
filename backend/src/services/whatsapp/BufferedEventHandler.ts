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
  jidNormalizedUser,
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
  // First normalize the JID to strip device suffix (e.g., 60182320607:0@s.whatsapp.net -> 60182320607@s.whatsapp.net)
  const normalized = jidNormalizedUser(jid);
  // Then extract just the user ID part
  return normalized.replace('@s.whatsapp.net', '').replace('@lid', '');
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
 * OPTIMIZED FOR 2GB RAM + SPEED
 */
const BATCH_CONFIG = {
  // Number of messages to process in parallel (increased for 2GB RAM)
  MESSAGE_BATCH_SIZE: 50,
  // Number of contacts to batch insert (increased for speed)
  CONTACT_BATCH_SIZE: 200,
  // Number of groups to process in parallel
  GROUP_BATCH_SIZE: 20,
  // Delay between batches (ms) - minimal for speed, still anti-ban safe
  BATCH_DELAY_MS: 10,
  // History sync processes ALL in parallel (no delays needed - it's background)
  HISTORY_MESSAGE_BATCH_SIZE: 100,
  HISTORY_GROUP_BATCH_SIZE: 50,
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
  // Step 1: Basic validation (sync)
  const basicFiltered = messages.filter(msg => {
    if (!msg.key) return false;
    const messageId = msg.key.id;
    if (!messageId) return false;

    // Skip broadcasts
    if (!msg.key.remoteJid || isJidBroadcast(msg.key.remoteJid)) {
      return false;
    }

    return true;
  });

  // Step 2: Memory-based deduplication (sync, fast) - CHECK ONLY, don't mark yet
  const memoryFiltered = basicFiltered.filter(msg => {
    const messageId = msg.key!.id!;
    // Use isProcessedSync to CHECK without marking
    if (messageDeduplicator.isProcessedSync(accountId, messageId)) {
      console.log(`[WA][Buffered] Skipping duplicate (memory): ${messageId}`);
      return false;
    }
    return true;
  });

  // Step 3: DB-backed deduplication for remaining messages (async, catches server restart dupes)
  // This also doesn't mark - we only mark after successful save
  const messageIds = memoryFiltered.map(msg => msg.key!.id!);
  const newMessageIds = await messageDeduplicator.filterNewWithDbCheck(accountId, messageIds);
  const newMessageIdSet = new Set(newMessageIds);

  // Mark all messages we're about to process (prevents race conditions with concurrent events)
  messageDeduplicator.markProcessedBatch(accountId, Array.from(newMessageIdSet));

  // Log duplicates but don't do additional DB queries - refresh will load from DB
  if (isRealTime && newMessageIdSet.size < memoryFiltered.length) {
    const duplicateCount = memoryFiltered.length - newMessageIdSet.size;
    console.log(`[WA][Buffered] ${duplicateCount} real-time messages already in DB (user can refresh to see)`);
  }

  const validMessages = memoryFiltered.filter(msg => {
    const messageId = msg.key!.id!;
    if (!newMessageIdSet.has(messageId)) {
      console.log(`[WA][Buffered] Skipping duplicate (DB): ${messageId}`);
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
  // For real-time messages (notify), skip delays for instant multi-agent sync
  for (let i = 0; i < userMessages.length; i += BATCH_CONFIG.MESSAGE_BATCH_SIZE) {
    const batch = userMessages.slice(i, i + BATCH_CONFIG.MESSAGE_BATCH_SIZE);
    await processBatch(batch, false);
    // Only delay for history sync, not real-time messages
    if (!isRealTime && i + BATCH_CONFIG.MESSAGE_BATCH_SIZE < userMessages.length) {
      await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
    }
  }

  // Process group messages in parallel batches
  for (let i = 0; i < groupMessages.length; i += BATCH_CONFIG.MESSAGE_BATCH_SIZE) {
    const batch = groupMessages.slice(i, i + BATCH_CONFIG.MESSAGE_BATCH_SIZE);
    await processBatch(batch, true);
    // Only delay for history sync, not real-time messages
    if (!isRealTime && i + BATCH_CONFIG.MESSAGE_BATCH_SIZE < groupMessages.length) {
      await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
    }
  }

  console.log(`[WA][Buffered] Processed ${userMessages.length} user + ${groupMessages.length} group messages`);
}

/**
 * Process messages.update (status changes AND edited messages) in batch
 */
async function processMessagesUpdate(
  ctx: ProcessingContext,
  updates: BaileysEventMap['messages.update']
): Promise<void> {
  const { accountId, userId } = ctx;

  // Batch status updates for efficiency
  const statusUpdates: Array<{ waMessageId: string; status: string }> = [];
  // Batch edited message updates
  const editedUpdates: Array<{ waMessageId: string; newContent: string; editedAt: Date }> = [];

  for (const update of updates) {
    const waMessageId = update.key.id;
    const newStatus = update.update.status;

    // Handle status updates
    if (newStatus !== undefined && newStatus !== null && waMessageId) {
      const statusStr = mapMessageStatus(newStatus as number);
      statusUpdates.push({ waMessageId, status: statusStr });
    }

    // Handle edited messages
    // The editedMessage contains the new message content after editing
    const editedMessage = (update.update as any).editedMessage;
    if (editedMessage && waMessageId) {
      // Extract the new text content from the edited message
      const newContent = editedMessage.message?.conversation ||
        editedMessage.message?.extendedTextMessage?.text ||
        editedMessage.message?.editedMessage?.message?.conversation ||
        editedMessage.message?.editedMessage?.message?.extendedTextMessage?.text ||
        null;

      if (newContent) {
        const timestamp = editedMessage.messageTimestamp;
        const editedAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
        editedUpdates.push({ waMessageId, newContent, editedAt });
        console.log(`[WA][Buffered] Message ${waMessageId} was edited: "${newContent.substring(0, 50)}..."`);
      }
    }
  }

  const io = getIO();

  // Process status updates in parallel
  if (statusUpdates.length > 0) {
    const results = await Promise.allSettled(statusUpdates.map(async ({ waMessageId, status }) => {
      const updatedMsg = await queryOne(
        `UPDATE messages SET status = $1, updated_at = NOW()
         WHERE wa_message_id = $2
         RETURNING id, conversation_id`,
        [status, waMessageId]
      );

      if (updatedMsg) {
        // Emit to account room so ALL agents see status updates
        io.to(`account:${accountId}`).emit('message:status', {
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

  // Process edited messages
  if (editedUpdates.length > 0) {
    const editResults = await Promise.allSettled(editedUpdates.map(async ({ waMessageId, newContent, editedAt }) => {
      const updatedMsg = await queryOne(
        `UPDATE messages
         SET content = $1, is_edited = TRUE, edited_at = $2, updated_at = NOW()
         WHERE wa_message_id = $3
         RETURNING id, conversation_id, content`,
        [newContent, editedAt, waMessageId]
      );

      if (updatedMsg) {
        // Emit to account room so ALL agents see edited messages
        io.to(`account:${accountId}`).emit('message:edited', {
          accountId,
          messageId: updatedMsg.id,
          waMessageId,
          conversationId: updatedMsg.conversation_id,
          newContent,
          editedAt: editedAt.toISOString(),
        });
      }

      return updatedMsg;
    }));

    const editSuccessful = editResults.filter(r => r.status === 'fulfilled').length;
    console.log(`[WA][Buffered] Processed ${editSuccessful}/${editedUpdates.length} edited messages`);
  }
}

/**
 * Process messaging-history.set with FULLY PARALLEL batch operations
 * Runs in background - does NOT block real-time messages
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
  const { accountId, userId } = ctx;

  const startTime = Date.now();
  console.log(`[WA][History] Starting background sync for ${accountId}:`);
  console.log(`  - chats: ${chats?.length || 0}, contacts: ${contacts?.length || 0}, messages: ${messages?.length || 0}`);

  // ============ PARALLEL PROCESSING: All three run simultaneously ============
  const results = await Promise.allSettled([
    // 1. CONTACTS - bulk insert all at once
    (async () => {
      if (!contacts || contacts.length === 0) return 0;

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
        contactBatch.push({
          whatsapp_account_id: accountId,
          wa_id: waId,
          phone_number: jidType === 'pn' ? waId : null,
          name: contact.name || contact.notify || null,
          jid_type: jidType,
        });
      }

      // Single bulk insert for all contacts
      if (contactBatch.length > 0) {
        await batchInsertContacts(contactBatch);
      }
      return contactBatch.length;
    })(),

    // 2. GROUPS - parallel batches, NO metadata API calls (use chat data only)
    (async () => {
      if (!chats || chats.length === 0) return 0;

      const groupChats = chats.filter((chat: any) => chat.id && isJidGroup(chat.id));
      if (groupChats.length === 0) return 0;

      // Process ALL groups in parallel batches (no delays - it's background)
      const batchSize = BATCH_CONFIG.HISTORY_GROUP_BATCH_SIZE;
      let processed = 0;

      for (let i = 0; i < groupChats.length; i += batchSize) {
        const batch = groupChats.slice(i, i + batchSize);

        await Promise.allSettled(batch.map(async (chat: any) => {
          try {
            // Use chat data directly - NO slow groupMetadata API calls
            // Metadata will be fetched lazily when user opens the group
            const group = await queryOne(
              `INSERT INTO groups (whatsapp_account_id, group_jid, name, participant_count)
               VALUES ($1, $2, $3, 0)
               ON CONFLICT (whatsapp_account_id, group_jid) DO UPDATE SET
                 name = COALESCE(NULLIF(EXCLUDED.name, ''), groups.name),
                 updated_at = NOW()
               RETURNING id`,
              [accountId, chat.id, chat.name || chat.subject || extractGroupId(chat.id)]
            );

            if (group) {
              await execute(
                `INSERT INTO conversations (whatsapp_account_id, group_id, is_group, last_message_at)
                 VALUES ($1, $2, TRUE, COALESCE($3, NOW()))
                 ON CONFLICT (whatsapp_account_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
                [accountId, group.id, chat.conversationTimestamp ? new Date(Number(chat.conversationTimestamp) * 1000) : null]
              );
              processed++;
            }
          } catch (error) {
            // Ignore duplicate errors
          }
        }));
      }
      return processed;
    })(),

    // 3. MESSAGES - large parallel batches (no delays - it's background)
    (async () => {
      if (!messages || messages.length === 0) return 0;

      const batchSize = BATCH_CONFIG.HISTORY_MESSAGE_BATCH_SIZE;
      let processed = 0;

      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        const results = await Promise.allSettled(batch.map(async (msg: proto.IWebMessageInfo) => {
          if (!msg.key) return false;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || isJidBroadcast(remoteJid)) return false;

          try {
            // Check if already exists (fast index lookup)
            const existing = await queryOne(
              'SELECT 1 FROM messages WHERE wa_message_id = $1 LIMIT 1',
              [msg.key.id]
            );
            if (existing) return false;

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
            return true;
          } catch (error) {
            // Silently ignore duplicates
            return false;
          }
        }));

        processed += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
      }
      return processed;
    })(),
  ]);

  const elapsed = Date.now() - startTime;
  const [contactsResult, groupsResult, messagesResult] = results;

  console.log(`[WA][History] Sync complete in ${elapsed}ms:`);
  console.log(`  - contacts: ${contactsResult.status === 'fulfilled' ? contactsResult.value : 'error'}`);
  console.log(`  - groups: ${groupsResult.status === 'fulfilled' ? groupsResult.value : 'error'}`);
  console.log(`  - messages: ${messagesResult.status === 'fulfilled' ? messagesResult.value : 'error'}`);

  // Emit sync progress to account room
  const io = getIO();
  io.to(`account:${accountId}`).emit('sync:progress', {
    accountId,
    progress: progress || 100,
    isLatest,
    chatsCount: chats?.length || 0,
    messagesCount: messages?.length || 0,
    elapsed,
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
        // QR code emit - can go to both user and account room for flexibility
        io.to(`account:${accountId}`).emit('qr:update', { accountId, qr });
        await execute(
          "UPDATE whatsapp_accounts SET status = 'qr_pending', updated_at = NOW() WHERE id = $1",
          [accountId]
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

        // Determine if we should reconnect based on disconnect reason
        // Don't reconnect for: loggedOut (401), connectionReplaced (440), badSession (500)
        // Reconnect for: timedOut (408), restartRequired (515), connectionClosed (428), undefined
        const noReconnectCodes = [
          DisconnectReason.loggedOut,        // 401 - logged out, need new QR
          DisconnectReason.connectionReplaced, // 440 - another device connected
          DisconnectReason.badSession,       // 500 - bad session, need new QR
        ];
        const shouldReconnect = statusCode === undefined || !noReconnectCodes.includes(statusCode);

        console.log(`[WA][Buffered] Connection closed. Code: ${statusCode}, reconnect: ${shouldReconnect}`);

        setReady(false);
        await execute(
          "UPDATE whatsapp_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1",
          [accountId]
        );
        // Emit to account room so ALL agents see status change
        io.to(`account:${accountId}`).emit('account:status', { accountId, status: 'disconnected' });

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

        // Emit to account room so ALL agents see status change
        io.to(`account:${accountId}`).emit('account:status', {
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

    // ============ HISTORY SYNC (NON-BLOCKING) ============
    // Fire and forget - runs in background, does NOT block real-time messages
    if (events['messaging-history.set']) {
      processHistorySync(ctx, events['messaging-history.set'], handlers)
        .catch(err => console.error(`[WA][History] Background sync error:`, err));
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
