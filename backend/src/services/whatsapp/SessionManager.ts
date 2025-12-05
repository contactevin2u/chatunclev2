import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessageKey,
  Browsers,
  isJidBroadcast,
  isJidGroup,
  isLidUser,
  isPnUser,
  getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { query, queryOne, execute } from '../../config/database';
import { getIO } from '../socket';
import { processAutoReply } from '../autoReplyProcessor';
import {
  preSendCheck,
  postSendRecord,
  getTypingDuration,
  sleep,
  getRandomDelay,
  getAntiBanStats,
  isInWarmupPeriod,
} from '../antiBan';
import pino from 'pino';

/**
 * Check if JID is a user (supports both @s.whatsapp.net and @lid formats)
 * WhatsApp introduced LID (Link ID) format for privacy - we need to handle both
 * Uses Baileys v7 built-in functions: isLidUser() and isPnUser()
 */
function isUserJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  // Use Baileys v7 functions to check both LID and PN (phone number) formats
  return isLidUser(jid) === true || isPnUser(jid) === true;
}

/**
 * Extract the user ID from a JID (works with both @s.whatsapp.net and @lid)
 */
function extractUserIdFromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '');
}

/**
 * Get the JID type from a JID using Baileys v7 functions
 * Returns 'lid' for @lid format, 'pn' for @s.whatsapp.net (phone number)
 */
function getJidType(jid: string): 'lid' | 'pn' {
  return isLidUser(jid) === true ? 'lid' : 'pn';
}

/**
 * Construct a full JID from wa_id and jid_type
 */
function constructJid(waId: string, jidType: 'lid' | 'pn' = 'pn'): string {
  if (waId.includes('@')) return waId;
  return jidType === 'lid' ? `${waId}@lid` : `${waId}@s.whatsapp.net`;
}

// Create logger - use info level to see important logs
const logger = pino({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
});

interface MessagePayload {
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
}

interface SessionState {
  socket: WASocket;
  isReady: boolean;
  readyPromise: Promise<void>;
  resolveReady: () => void;
}

class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = path.join(process.cwd(), 'sessions');

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // Wait for session to be ready with timeout
  private async waitForReady(accountId: string, timeoutMs: number = 30000): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.isReady) {
      return;
    }

    // Wait for ready with timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Session sync timeout - please try again')), timeoutMs);
    });

    await Promise.race([session.readyPromise, timeoutPromise]);
  }

  async createSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Creating session for account ${accountId}, user ${userId}`);

    const sessionPath = path.join(this.sessionsDir, accountId);

    // Fetch latest WhatsApp Web version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA] Using WA Web v${version.join('.')}, isLatest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Create socket with proper configuration based on latest Baileys documentation
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // Use Browsers helper for proper browser identification (recommended by Baileys docs)
      browser: Browsers.ubuntu('ChatUncle'),
      // Enable full history sync for retrieving old messages
      syncFullHistory: true,
      // Don't mark as online on connect - allows user to receive notifications on phone
      markOnlineOnConnect: false,
      // Disable link preview generation (reduces processing overhead)
      generateHighQualityLinkPreview: false,
      // getMessage callback for poll decryption and message retries
      // This should return the message content from your database
      getMessage: async (key: WAMessageKey) => {
        try {
          const msg = await queryOne(
            'SELECT content, content_type FROM messages WHERE wa_message_id = $1',
            [key.id]
          );
          if (msg?.content) {
            return proto.Message.fromObject({ conversation: msg.content });
          }
        } catch (error) {
          console.error('[WA] Error fetching message for retry:', error);
        }
        return proto.Message.fromObject({});
      },
    });

    // Create session state with ready promise
    let resolveReady: () => void = () => {};
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const sessionState: SessionState = {
      socket: sock,
      isReady: false,
      readyPromise,
      resolveReady,
    };

    // Store session state
    this.sessions.set(accountId, sessionState);

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`[WA] Connection update:`, { connection, hasQR: !!qr });

      const io = getIO();

      if (qr) {
        console.log(`[WA] QR code generated for account ${accountId}`);
        // Send QR code to frontend
        io.to(`user:${userId}`).emit('qr:update', {
          accountId,
          qr,
        });

        await execute(
          "UPDATE whatsapp_accounts SET status = 'qr_pending', updated_at = NOW() WHERE id = $1",
          [accountId]
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WA] Connection closed. Status code: ${statusCode}, shouldReconnect: ${shouldReconnect}`);

        // Mark session as not ready
        const session = this.sessions.get(accountId);
        if (session) {
          session.isReady = false;
        }

        await execute(
          "UPDATE whatsapp_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1",
          [accountId]
        );

        io.to(`user:${userId}`).emit('account:status', {
          accountId,
          status: 'disconnected',
        });

        // Reconnect if not logged out
        if (shouldReconnect) {
          console.log(`[WA] Reconnecting session ${accountId} in 5 seconds...`);
          setTimeout(() => {
            this.reconnectSession(accountId, userId);
          }, 5000);
        } else {
          // Clean up session files on logout
          this.cleanupSession(accountId);
        }
      }

      if (connection === 'open') {
        console.log(`[WA] Session ${accountId} connected successfully!`);
        console.log(`[WA] User:`, sock.user);

        // Get phone number from socket
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

        // Mark session as ready for sending messages
        const session = this.sessions.get(accountId);
        if (session) {
          session.isReady = true;
          session.resolveReady();
          console.log(`[WA] Session ${accountId} is now ready for sending messages`);
        }
      }
    });

    // Handle incoming messages - both real-time and history
    sock.ev.on('messages.upsert', async (upsert) => {
      const { messages, type } = upsert;
      console.log(`[WA] messages.upsert - type: ${type}, count: ${messages.length}`);

      // Process all message types: 'notify' (real-time) and 'append' (history)
      for (const msg of messages) {
        if (!msg.key) continue;
        const remoteJid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const messageId = msg.key.id;

        console.log(`[WA] Message: jid=${remoteJid}, fromMe=${fromMe}, id=${messageId}, type=${type}`);

        // Skip status broadcasts using Baileys helper
        if (!remoteJid || isJidBroadcast(remoteJid)) continue;

        // Skip group messages using Baileys helper
        if (isJidGroup(remoteJid)) continue;

        // Only process user messages
        if (!isUserJid(remoteJid)) continue;

        // Handle our own sent messages (from phone or ChatUncle)
        if (fromMe) {
          console.log(`[WA] Sent message from self: ${messageId}`);

          // Check if message already exists in DB
          const existingMsg = await queryOne(
            'SELECT id FROM messages WHERE wa_message_id = $1',
            [messageId]
          );

          if (existingMsg) {
            // Update status of existing message (sent from ChatUncle)
            await execute(
              `UPDATE messages SET status = 'sent', updated_at = NOW() WHERE wa_message_id = $1`,
              [messageId]
            );
          } else {
            // Save message sent from phone - needs to be stored
            try {
              await this.handleOutgoingMessage(accountId, userId, msg, type === 'notify');
            } catch (error) {
              console.error(`[WA] Error saving outgoing message:`, error);
            }
          }
          continue;
        }

        try {
          await this.handleIncomingMessage(accountId, userId, msg, type === 'notify');
          console.log(`[WA] Message ${messageId} processed successfully`);
        } catch (error) {
          console.error(`[WA] Error processing message ${messageId}:`, error);
        }
      }
    });

    // Handle message status updates (sent, delivered, read)
    sock.ev.on('messages.update', async (updates) => {
      console.log(`[WA] messages.update - count: ${updates.length}`);
      for (const update of updates) {
        const waMessageId = update.key.id;
        const newStatus = update.update.status;

        if (newStatus !== undefined && newStatus !== null) {
          const statusStr = this.mapMessageStatus(newStatus as number);
          console.log(`[WA] Message ${waMessageId} status: ${newStatus} -> ${statusStr}`);

          try {
            // Update status in database and get the internal message ID
            const updatedMsg = await queryOne(
              `UPDATE messages SET status = $1, updated_at = NOW()
               WHERE wa_message_id = $2
               RETURNING id, conversation_id`,
              [statusStr, waMessageId]
            );

            if (updatedMsg) {
              // Emit to frontend with internal message ID
              const io = getIO();
              io.to(`user:${userId}`).emit('message:status', {
                accountId,
                messageId: updatedMsg.id,
                waMessageId,
                conversationId: updatedMsg.conversation_id,
                status: statusStr,
              });
            }
          } catch (error) {
            console.error(`[WA] Failed to update message status:`, error);
          }
        }
      }
    });

    // Handle history sync - this is the main event for getting old messages
    sock.ev.on('messaging-history.set', async (historyData) => {
      const { chats, contacts, messages, isLatest, progress, syncType } = historyData as any;

      console.log(`[WA] messaging-history.set:`);
      console.log(`  - chats: ${chats?.length || 0}`);
      console.log(`  - contacts: ${contacts?.length || 0}`);
      console.log(`  - messages: ${messages?.length || 0}`);
      console.log(`  - isLatest: ${isLatest}`);
      console.log(`  - progress: ${progress}`);
      console.log(`  - syncType: ${syncType}`);

      // Process contacts from history using Baileys jid helpers
      if (contacts && contacts.length > 0) {
        let processedContactCount = 0;
        for (const contact of contacts) {
          try {
            // Skip non-user contacts (groups, broadcasts, etc)
            if (!contact.id || !isUserJid(contact.id)) continue;

            const waId = extractUserIdFromJid(contact.id);
            const jidType = getJidType(contact.id);
            const phoneNumber = jidType === 'pn' ? waId : null;

            await queryOne(
              `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name, jid_type)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (whatsapp_account_id, wa_id) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, contacts.name),
               jid_type = EXCLUDED.jid_type,
               updated_at = NOW()
               RETURNING *`,
              [accountId, waId, phoneNumber, contact.name || contact.notify || null, jidType]
            );
            processedContactCount++;
          } catch (error) {
            console.error(`[WA] Error processing contact:`, error);
          }
        }
        console.log(`[WA] Processed ${processedContactCount} contacts from history`);
      }

      // Process messages from history
      if (messages && messages.length > 0) {
        let processedCount = 0;
        for (const msg of messages) {
          if (!msg.key) continue;
          const remoteJid = msg.key.remoteJid;

          // Skip status broadcasts and groups using Baileys helpers
          if (!remoteJid || isJidBroadcast(remoteJid)) continue;
          if (isJidGroup(remoteJid)) continue;
          if (!isUserJid(remoteJid)) continue;

          try {
            // Check if message already exists
            const existingMsg = await queryOne(
              'SELECT id FROM messages WHERE wa_message_id = $1',
              [msg.key.id]
            );
            if (existingMsg) continue;

            if (msg.key.fromMe) {
              // Outgoing message sent from phone
              await this.handleOutgoingMessage(accountId, userId, msg, false);
            } else {
              // Incoming message from contact
              await this.handleIncomingMessage(accountId, userId, msg, false);
            }
            processedCount++;
          } catch (error) {
            // Ignore duplicate errors
            if (!(error as any)?.message?.includes('duplicate')) {
              console.error(`[WA] Error processing history message:`, error);
            }
          }
        }
        console.log(`[WA] Processed ${processedCount} messages from history`);
      }

      // Notify frontend about sync progress
      const io = getIO();
      io.to(`user:${userId}`).emit('sync:progress', {
        accountId,
        progress: progress || 100,
        isLatest,
        chatsCount: chats?.length || 0,
        messagesCount: messages?.length || 0,
      });
    });

    // Handle chat updates
    sock.ev.on('chats.upsert', async (chats) => {
      console.log(`[WA] chats.upsert - count: ${chats.length}`);
    });

    sock.ev.on('chats.update', async (updates) => {
      console.log(`[WA] chats.update - count: ${updates.length}`);
    });

    // Handle contacts using Baileys jid helpers
    sock.ev.on('contacts.upsert', async (contacts) => {
      console.log(`[WA] contacts.upsert - count: ${contacts.length}`);

      for (const contact of contacts) {
        try {
          // Skip non-user contacts (groups, broadcasts, etc)
          if (!contact.id || !isUserJid(contact.id)) continue;

          const waId = extractUserIdFromJid(contact.id);
          const jidType = getJidType(contact.id);
          const phoneNumber = jidType === 'pn' ? waId : null;

          await queryOne(
            `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name, jid_type)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (whatsapp_account_id, wa_id) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, contacts.name),
             jid_type = EXCLUDED.jid_type,
             updated_at = NOW()
             RETURNING *`,
            [accountId, waId, phoneNumber, contact.name || contact.notify || null, jidType]
          );
        } catch (error) {
          console.error(`[WA] Error upserting contact:`, error);
        }
      }
    });

    sock.ev.on('contacts.update', async (updates) => {
      console.log(`[WA] contacts.update - count: ${updates.length}`);
    });

    // Handle LID-to-PN mapping updates (Baileys v7 feature)
    // This event provides mappings between LID and phone number formats
    sock.ev.on('lid-mapping.update', async (mappings) => {
      console.log(`[WA] lid-mapping.update - mappings received:`, Object.keys(mappings).length);

      // Update contacts with LID->PN mappings
      for (const [lid, pn] of Object.entries(mappings)) {
        try {
          // If we have a contact with this LID, update their phone number
          await execute(
            `UPDATE contacts
             SET phone_number = $1, jid_type = 'pn', updated_at = NOW()
             WHERE whatsapp_account_id = $2 AND wa_id = $3`,
            [pn, accountId, lid.replace('@lid', '')]
          );
          console.log(`[WA] Updated LID->PN mapping: ${lid} -> ${pn}`);
        } catch (error) {
          console.error(`[WA] Error updating LID mapping:`, error);
        }
      }
    });

    console.log(`[WA] Session ${accountId} event handlers registered`);
  }

  private mapMessageStatus(status: number): string {
    switch (status) {
      case 0: return 'pending';
      case 1: return 'sent';
      case 2: return 'delivered';
      case 3:
      case 4: return 'read';
      default: return 'sent';
    }
  }

  private async handleIncomingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;  // Extract for TypeScript type narrowing
    const remoteJid = msgKey.remoteJid;

    // Use Baileys helpers for jid validation
    if (!remoteJid || isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) return;
    if (!isUserJid(remoteJid)) return;

    // Extract phone number from jid and determine JID type
    const waId = extractUserIdFromJid(remoteJid);
    const jidType = getJidType(remoteJid);

    // Get pushName from the message (sender's WhatsApp display name)
    const pushName = msg.pushName || null;

    console.log(`[WA] Processing message from ${waId} (${jidType}), pushName: ${pushName}, realtime: ${isRealTime}`);

    // Get or create contact
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2',
      [accountId, waId]
    );

    if (!contact) {
      // For LID contacts, phone_number might not be the actual phone - store wa_id
      // For PN contacts, wa_id IS the phone number
      const phoneNumber = jidType === 'pn' ? waId : null;
      contact = await queryOne(
        `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name, jid_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [accountId, waId, phoneNumber, pushName, jidType]
      );
      console.log(`[WA] Created new contact: ${contact.id} with name: ${pushName}, jid_type: ${jidType}`);
    } else {
      // Update contact if needed
      let needsUpdate = false;
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (pushName && !contact.name) {
        updates.push(`name = $${paramIndex++}`);
        values.push(pushName);
        needsUpdate = true;
      }

      // Update jid_type if it changed (might have been default 'pn')
      if (contact.jid_type !== jidType) {
        updates.push(`jid_type = $${paramIndex++}`);
        values.push(jidType);
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push(`updated_at = NOW()`);
        values.push(contact.id);
        await execute(
          `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
        contact.name = pushName || contact.name;
        contact.jid_type = jidType;
        console.log(`[WA] Updated contact ${contact.id}: name=${pushName}, jid_type=${jidType}`);
      }
    }

    // Get or create conversation
    let conversation = await queryOne(
      'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2',
      [accountId, contact.id]
    );

    if (!conversation) {
      conversation = await queryOne(
        `INSERT INTO conversations (whatsapp_account_id, contact_id, unread_count, last_message_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [accountId, contact.id, isRealTime ? 1 : 0]
      );
      console.log(`[WA] Created new conversation: ${conversation.id}`);
    } else if (isRealTime) {
      await execute(
        `UPDATE conversations
         SET unread_count = unread_count + 1, last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );
    }

    // Check if message already exists
    const existingMessage = await queryOne(
      'SELECT id FROM messages WHERE wa_message_id = $1',
      [msgKey.id]
    );

    if (existingMessage) {
      console.log(`[WA] Message ${msgKey.id} already exists, skipping`);
      return;
    }

    // Determine message type and content using Baileys getContentType helper
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaMimeType = null;

    // Use Baileys getContentType to detect message type
    const msgType = messageContent ? getContentType(messageContent) : undefined;
    console.log(`[WA] Message content type: ${msgType}`);

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        break;
      case 'ptvMessage':
        // Circular video notes (push-to-talk video)
        contentType = 'video';
        content = '[Video Note]';
        mediaMimeType = 'video/mp4';
        break;
      case 'documentMessage':
      case 'documentWithCaptionMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName ||
                  messageContent?.documentWithCaptionMessage?.message?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype ||
                        messageContent?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ||
                        'application/octet-stream';
        break;
      case 'stickerMessage':
        contentType = 'image';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        break;
      case 'contactMessage':
      case 'contactsArrayMessage':
        contentType = 'text';
        content = `[Contact: ${messageContent?.contactMessage?.displayName || 'Shared Contact'}]`;
        break;
      case 'locationMessage':
      case 'liveLocationMessage':
        contentType = 'text';
        const loc = messageContent?.locationMessage || messageContent?.liveLocationMessage;
        content = `[Location: ${loc?.degreesLatitude?.toFixed(4)}, ${loc?.degreesLongitude?.toFixed(4)}]`;
        break;
      case 'reactionMessage':
        // Reactions update existing messages - save them as a special type
        const reaction = messageContent?.reactionMessage;
        if (reaction?.text) {
          contentType = 'text';
          content = `[Reacted: ${reaction.text}]`;
          console.log(`[WA] Reaction: ${reaction.text}`);
        } else {
          console.log(`[WA] Skipping empty reaction`);
          return;
        }
        break;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        // Protocol messages - skip them
        console.log(`[WA] Skipping protocol message: ${msgType}`);
        return;
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':
        contentType = 'text';
        const poll = messageContent?.pollCreationMessage || messageContent?.pollCreationMessageV2 || messageContent?.pollCreationMessageV3;
        content = `[Poll: ${poll?.name || 'Untitled Poll'}]`;
        break;
      case 'pollUpdateMessage':
        console.log(`[WA] Skipping poll update`);
        return;
      default:
        // Unknown message type - log it but still save
        console.log(`[WA] Unknown message type: ${msgType}`, Object.keys(messageContent || {}));
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    // Get message timestamp
    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Save message
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, created_at)
       VALUES ($1, $2, 'contact', $3, $4, $5, $6, 'delivered', $7)
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp]
    );

    console.log(`[WA] Saved message ${savedMessage.id} (${contentType}): ${content.substring(0, 50)}...`);

    // Only emit to frontend for real-time messages
    if (isRealTime) {
      const io = getIO();
      io.to(`user:${userId}`).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        message: savedMessage,
        contact: {
          id: contact.id,
          name: contact.name,
          phone_number: contact.phone_number,
        },
      });

      // Process auto-reply rules for text messages
      if (contentType === 'text' && content) {
        try {
          await processAutoReply({
            accountId,
            conversationId: conversation.id,
            contactWaId: waId,
            jidType,
            content,
            userId,
          });
        } catch (error) {
          console.error('[WA] Auto-reply processing error:', error);
        }
      }
    }
  }

  // Handle outgoing messages sent from phone (not through ChatUncle)
  private async handleOutgoingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;  // Extract for TypeScript type narrowing
    const remoteJid = msgKey.remoteJid;

    if (!remoteJid || isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) return;
    if (!isUserJid(remoteJid)) return;

    const waId = extractUserIdFromJid(remoteJid);
    const jidType = getJidType(remoteJid);

    console.log(`[WA] Processing outgoing message to ${waId} (${jidType}), realtime: ${isRealTime}`);

    // Get or create contact
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2',
      [accountId, waId]
    );

    if (!contact) {
      const phoneNumber = jidType === 'pn' ? waId : null;
      contact = await queryOne(
        `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, jid_type)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [accountId, waId, phoneNumber, jidType]
      );
    } else if (contact.jid_type !== jidType) {
      // Update jid_type if it changed
      await execute(
        `UPDATE contacts SET jid_type = $1, updated_at = NOW() WHERE id = $2`,
        [jidType, contact.id]
      );
      contact.jid_type = jidType;
    }

    // Get or create conversation
    let conversation = await queryOne(
      'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2',
      [accountId, contact.id]
    );

    if (!conversation) {
      conversation = await queryOne(
        `INSERT INTO conversations (whatsapp_account_id, contact_id, last_message_at)
         VALUES ($1, $2, NOW())
         RETURNING *`,
        [accountId, contact.id]
      );
    } else {
      await execute(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [conversation.id]
      );
    }

    // Parse message content using Baileys getContentType helper
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaMimeType = null;

    const msgType = messageContent ? getContentType(messageContent) : undefined;
    console.log(`[WA] Outgoing message content type: ${msgType}`);

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        break;
      case 'ptvMessage':
        // Circular video notes (push-to-talk video)
        contentType = 'video';
        content = '[Video Note]';
        mediaMimeType = 'video/mp4';
        break;
      case 'documentMessage':
      case 'documentWithCaptionMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName ||
                  messageContent?.documentWithCaptionMessage?.message?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype ||
                        messageContent?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ||
                        'application/octet-stream';
        break;
      case 'stickerMessage':
        contentType = 'image';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        break;
      case 'contactMessage':
      case 'contactsArrayMessage':
        contentType = 'text';
        content = `[Contact: ${messageContent?.contactMessage?.displayName || 'Shared Contact'}]`;
        break;
      case 'locationMessage':
      case 'liveLocationMessage':
        contentType = 'text';
        const loc = messageContent?.locationMessage || messageContent?.liveLocationMessage;
        content = `[Location: ${loc?.degreesLatitude?.toFixed(4)}, ${loc?.degreesLongitude?.toFixed(4)}]`;
        break;
      case 'reactionMessage':
        // Reactions - save them as special type
        const reaction = messageContent?.reactionMessage;
        if (reaction?.text) {
          contentType = 'text';
          content = `[Reacted: ${reaction.text}]`;
        } else {
          console.log(`[WA] Skipping empty outgoing reaction`);
          return;
        }
        break;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        // Protocol messages - skip them
        console.log(`[WA] Skipping outgoing protocol message: ${msgType}`);
        return;
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':
        contentType = 'text';
        const poll = messageContent?.pollCreationMessage || messageContent?.pollCreationMessageV2 || messageContent?.pollCreationMessageV3;
        content = `[Poll: ${poll?.name || 'Untitled Poll'}]`;
        break;
      case 'pollUpdateMessage':
        console.log(`[WA] Skipping outgoing poll update`);
        return;
      default:
        // Unknown message type - log it but still save
        console.log(`[WA] Unknown outgoing message type: ${msgType}`, Object.keys(messageContent || {}));
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    // Get message timestamp
    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Save message as sent by agent (from phone)
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, created_at)
       VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent', $7)
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp]
    );

    console.log(`[WA] Saved outgoing message ${savedMessage.id}: ${content.substring(0, 50)}...`);

    // Emit to frontend
    if (isRealTime) {
      const io = getIO();
      io.to(`user:${userId}`).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        message: savedMessage,
        contact: {
          id: contact.id,
          name: contact.name,
          phone_number: contact.phone_number,
        },
      });
    }
  }

  async sendMessage(
    accountId: string,
    waId: string,
    payload: MessagePayload,
    options: { skipAntiBan?: boolean; jidType?: 'lid' | 'pn' } = {}
  ): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Wait for session to be fully synced and ready
    try {
      await this.waitForReady(accountId, 30000);
    } catch (error) {
      console.error(`[WA] Session not ready for account ${accountId}:`, error);
      throw new Error('Session is still syncing - please wait a moment and try again');
    }

    const sock = session.socket;

    // Check if socket is connected
    if (!sock.user) {
      throw new Error('Session not connected - please reconnect');
    }

    // Construct JID using the stored jid_type (lid or pn format)
    const jidType = options.jidType || 'pn';
    const jid = constructJid(waId, jidType);

    console.log(`[WA] Sending ${payload.type} message to ${jid}`);
    console.log(`[WA] Connected as: ${sock.user?.id}`);

    // === ANTI-BAN MEASURES ===
    if (!options.skipAntiBan) {
      // 1. Pre-send check (rate limiting, daily limits, batch cooldowns)
      const preCheck = await preSendCheck(accountId, waId);
      if (!preCheck.canSend) {
        console.warn(`[WA] Anti-ban blocked send: ${preCheck.reason}`);
        throw new Error(`Message blocked: ${preCheck.reason}`);
      }

      // 2. Simulate reading the conversation (mark as "online" briefly)
      try {
        await sock.sendPresenceUpdate('available', jid);
        await sleep(getRandomDelay(500, 1500));
      } catch (e) {
        console.log(`[WA] Presence update skipped:`, e);
      }

      // 3. Simulate typing indicator (human-like behavior)
      const messageLength = payload.content?.length || 50;
      const typingDuration = getTypingDuration(messageLength);
      console.log(`[AntiBan] Simulating typing for ${typingDuration}ms`);

      try {
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(typingDuration);
        await sock.sendPresenceUpdate('paused', jid);
        await sleep(getRandomDelay(200, 500)); // Brief pause after typing
      } catch (e) {
        console.log(`[WA] Typing indicator skipped:`, e);
      }
    }

    let result;

    try {
      switch (payload.type) {
        case 'text':
          if (!payload.content) {
            throw new Error('Text content is required');
          }
          result = await sock.sendMessage(jid, { text: payload.content });
          break;

        case 'image':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for image');
          }
          result = await sock.sendMessage(jid, {
            image: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          });
          break;

        case 'video':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for video');
          }
          result = await sock.sendMessage(jid, {
            video: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          });
          break;

        case 'audio':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for audio');
          }
          result = await sock.sendMessage(jid, {
            audio: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'audio/mp4',
            ptt: true,
          });
          break;

        case 'document':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for document');
          }
          result = await sock.sendMessage(jid, {
            document: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'application/octet-stream',
            fileName: payload.content || 'document',
          });
          break;

        default:
          throw new Error('Unsupported message type');
      }

      // Log full result for debugging
      console.log(`[WA] Message sent successfully:`, {
        id: result?.key?.id,
        remoteJid: result?.key?.remoteJid,
        fromMe: result?.key?.fromMe,
        status: result?.status,
        messageTimestamp: result?.messageTimestamp,
      });

      if (!result?.key?.id) {
        throw new Error('Message sent but no ID returned');
      }

      // === POST-SEND ANTI-BAN RECORDING ===
      if (!options.skipAntiBan) {
        await postSendRecord(accountId, waId);

        // Go back to "unavailable" after sending (don't stay online)
        try {
          await sleep(getRandomDelay(1000, 3000));
          await sock.sendPresenceUpdate('unavailable', jid);
        } catch (e) {
          // Ignore presence errors
        }
      }

      return result.key.id;
    } catch (error) {
      console.error(`[WA] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Mark messages as read (sends read receipt)
   * Helps maintain a natural conversation appearance
   */
  async markAsRead(accountId: string, keys: WAMessageKey[]): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session?.isReady) return;

    try {
      await session.socket.readMessages(keys);
      console.log(`[WA] Marked ${keys.length} messages as read`);
    } catch (error) {
      console.error(`[WA] Failed to mark messages as read:`, error);
    }
  }

  /**
   * Send presence update (online, offline, typing)
   */
  async sendPresence(
    accountId: string,
    jid: string,
    presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session?.isReady) return;

    try {
      await session.socket.sendPresenceUpdate(presence, jid);
    } catch (error) {
      console.error(`[WA] Failed to send presence:`, error);
    }
  }

  /**
   * Get anti-ban statistics for an account
   */
  async getAntiBanStats(accountId: string) {
    return getAntiBanStats(accountId);
  }

  /**
   * Check if account is in warm-up period (higher risk)
   */
  async isInWarmupPeriod(accountId: string): Promise<boolean> {
    return isInWarmupPeriod(accountId);
  }

  async reconnectSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Reconnecting session ${accountId}`);
    await this.destroySession(accountId);
    await this.createSession(accountId, userId);
  }

  async destroySession(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      console.log(`[WA] Destroying session ${accountId}`);
      try {
        session.socket.end(undefined);
      } catch (error) {
        console.error(`[WA] Error ending socket:`, error);
      }
      this.sessions.delete(accountId);
    }
  }

  private cleanupSession(accountId: string): void {
    console.log(`[WA] Cleaning up session files for ${accountId}`);
    const sessionPath = path.join(this.sessionsDir, accountId);

    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  }

  async restoreAllSessions(): Promise<void> {
    try {
      const accounts = await query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM whatsapp_accounts WHERE status = 'connected'"
      );

      console.log(`[WA] Restoring ${accounts.length} WhatsApp sessions...`);

      for (const account of accounts) {
        try {
          console.log(`[WA] Restoring session for account ${account.id}`);
          await this.createSession(account.id, account.user_id);
        } catch (error) {
          console.error(`[WA] Failed to restore session ${account.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[WA] Failed to restore sessions:', error);
    }
  }

  getSession(accountId: string): WASocket | undefined {
    const session = this.sessions.get(accountId);
    return session?.socket;
  }

  isSessionReady(accountId: string): boolean {
    const session = this.sessions.get(accountId);
    return session?.isReady || false;
  }
}

export const sessionManager = new SessionManager();
