import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessageKey,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { query, queryOne, execute } from '../../config/database';
import { getIO } from '../socket';
import pino from 'pino';

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

class SessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = path.join(process.cwd(), 'sessions');

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async createSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Creating session for account ${accountId}, user ${userId}`);

    const sessionPath = path.join(this.sessionsDir, accountId);

    // Fetch latest WhatsApp Web version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA] Using WA Web v${version.join('.')}, isLatest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Create socket with proper configuration
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ['ChatUncle', 'Chrome', '121.0.0'],
      syncFullHistory: true, // Enable full history sync
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      // getMessage - fetch from database if needed for retries
      getMessage: async (key: WAMessageKey) => {
        // Try to get message from database
        try {
          const msg = await queryOne(
            'SELECT content FROM messages WHERE wa_message_id = $1',
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

    // Store session
    this.sessions.set(accountId, sock);

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
      }
    });

    // Handle incoming messages - both real-time and history
    sock.ev.on('messages.upsert', async (upsert) => {
      const { messages, type } = upsert;
      console.log(`[WA] messages.upsert - type: ${type}, count: ${messages.length}`);

      // Process all message types: 'notify' (real-time) and 'append' (history)
      for (const msg of messages) {
        const remoteJid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const messageId = msg.key.id;

        console.log(`[WA] Message: jid=${remoteJid}, fromMe=${fromMe}, id=${messageId}, type=${type}`);

        // Skip messages we sent
        if (fromMe) continue;

        // Skip status broadcasts
        if (remoteJid === 'status@broadcast') continue;

        // Skip group messages for now
        if (remoteJid?.endsWith('@g.us')) continue;

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
        if (update.update.status) {
          const io = getIO();
          io.to(`user:${userId}`).emit('message:status', {
            accountId,
            messageId: update.key.id,
            status: this.mapMessageStatus(update.update.status),
          });
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

      // Process contacts from history
      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          try {
            const waId = contact.id?.replace('@s.whatsapp.net', '').replace('@g.us', '');
            if (!waId || contact.id?.endsWith('@g.us')) continue;

            await queryOne(
              `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (whatsapp_account_id, wa_id) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, contacts.name),
               updated_at = NOW()
               RETURNING *`,
              [accountId, waId, waId, contact.name || contact.notify || null]
            );
          } catch (error) {
            console.error(`[WA] Error processing contact:`, error);
          }
        }
        console.log(`[WA] Processed ${contacts.length} contacts from history`);
      }

      // Process messages from history
      if (messages && messages.length > 0) {
        let processedCount = 0;
        for (const msg of messages) {
          // Skip messages we sent, status broadcasts, and groups
          if (msg.key.fromMe) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;
          if (msg.key.remoteJid?.endsWith('@g.us')) continue;

          try {
            await this.handleIncomingMessage(accountId, userId, msg, false);
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

    // Handle contacts
    sock.ev.on('contacts.upsert', async (contacts) => {
      console.log(`[WA] contacts.upsert - count: ${contacts.length}`);

      for (const contact of contacts) {
        try {
          const waId = contact.id?.replace('@s.whatsapp.net', '').replace('@g.us', '');
          if (!waId || contact.id?.endsWith('@g.us')) continue;

          await queryOne(
            `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (whatsapp_account_id, wa_id) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, contacts.name),
             updated_at = NOW()
             RETURNING *`,
            [accountId, waId, waId, contact.name || contact.notify || null]
          );
        } catch (error) {
          console.error(`[WA] Error upserting contact:`, error);
        }
      }
    });

    sock.ev.on('contacts.update', async (updates) => {
      console.log(`[WA] contacts.update - count: ${updates.length}`);
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
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const waId = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const isGroup = remoteJid.endsWith('@g.us');

    // Skip group messages
    if (isGroup) return;

    console.log(`[WA] Processing message from ${waId}, realtime: ${isRealTime}`);

    // Get or create contact
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2',
      [accountId, waId]
    );

    if (!contact) {
      contact = await queryOne(
        `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [accountId, waId, waId]
      );
      console.log(`[WA] Created new contact: ${contact.id}`);
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
      [msg.key.id]
    );

    if (existingMessage) {
      console.log(`[WA] Message ${msg.key.id} already exists, skipping`);
      return;
    }

    // Determine message type and content
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaMimeType = null;

    if (messageContent?.conversation) {
      content = messageContent.conversation;
    } else if (messageContent?.extendedTextMessage?.text) {
      content = messageContent.extendedTextMessage.text;
    } else if (messageContent?.imageMessage) {
      contentType = 'image';
      content = messageContent.imageMessage.caption || '';
      mediaMimeType = messageContent.imageMessage.mimetype || 'image/jpeg';
    } else if (messageContent?.videoMessage) {
      contentType = 'video';
      content = messageContent.videoMessage.caption || '';
      mediaMimeType = messageContent.videoMessage.mimetype || 'video/mp4';
    } else if (messageContent?.audioMessage) {
      contentType = 'audio';
      mediaMimeType = messageContent.audioMessage.mimetype || 'audio/ogg';
    } else if (messageContent?.documentMessage) {
      contentType = 'document';
      content = messageContent.documentMessage.fileName || '';
      mediaMimeType = messageContent.documentMessage.mimetype || 'application/octet-stream';
    } else if (messageContent?.stickerMessage) {
      contentType = 'image';
      content = '[Sticker]';
      mediaMimeType = messageContent.stickerMessage.mimetype || 'image/webp';
    } else {
      // Unknown message type
      console.log(`[WA] Unknown message type:`, Object.keys(messageContent || {}));
      content = '[Unsupported message type]';
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
      [conversation.id, msg.key.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp]
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
    }
  }

  async sendMessage(accountId: string, waId: string, payload: MessagePayload): Promise<string> {
    const sock = this.sessions.get(accountId);
    if (!sock) {
      throw new Error('Session not found');
    }
    const jid = waId.includes('@') ? waId : `${waId}@s.whatsapp.net`;

    console.log(`[WA] Sending ${payload.type} message to ${jid}`);

    let result;

    switch (payload.type) {
      case 'text':
        result = await sock.sendMessage(jid, { text: payload.content || '' });
        break;

      case 'image':
        result = await sock.sendMessage(jid, {
          image: { url: payload.mediaUrl! },
          caption: payload.content,
        });
        break;

      case 'video':
        result = await sock.sendMessage(jid, {
          video: { url: payload.mediaUrl! },
          caption: payload.content,
        });
        break;

      case 'audio':
        result = await sock.sendMessage(jid, {
          audio: { url: payload.mediaUrl! },
          mimetype: payload.mediaMimeType || 'audio/mp4',
          ptt: true,
        });
        break;

      case 'document':
        result = await sock.sendMessage(jid, {
          document: { url: payload.mediaUrl! },
          mimetype: payload.mediaMimeType || 'application/octet-stream',
          fileName: payload.content || 'document',
        });
        break;

      default:
        throw new Error('Unsupported message type');
    }

    console.log(`[WA] Message sent, id: ${result?.key?.id}`);
    return result?.key?.id || '';
  }

  async reconnectSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Reconnecting session ${accountId}`);
    await this.destroySession(accountId);
    await this.createSession(accountId, userId);
  }

  async destroySession(accountId: string): Promise<void> {
    const sock = this.sessions.get(accountId);
    if (sock) {
      console.log(`[WA] Destroying session ${accountId}`);
      try {
        sock.end(undefined);
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
    return this.sessions.get(accountId);
  }
}

export const sessionManager = new SessionManager();
