import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { query, queryOne, execute } from '../../config/database';
import { getIO } from '../socket';
import pino from 'pino';

const logger = pino({ level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn' });

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
    const sessionPath = path.join(this.sessionsDir, accountId);

    // Fetch latest version for better compatibility
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ['ChatUncle', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => {
        return { conversation: '' };
      },
    });

    this.sessions.set(accountId, sock);

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      const io = getIO();

      if (qr) {
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

        await execute(
          "UPDATE whatsapp_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1",
          [accountId]
        );

        io.to(`user:${userId}`).emit('account:status', {
          accountId,
          status: 'disconnected',
        });

        // Reconnect if not logged out
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log(`Session ${accountId} disconnected, attempting reconnect...`);
          setTimeout(() => {
            this.reconnectSession(accountId, userId);
          }, 5000);
        } else {
          // Clean up session files
          this.cleanupSession(accountId);
        }
      }

      if (connection === 'open') {
        console.log(`Session ${accountId} connected`);

        // Get phone number from socket
        const phoneNumber = sock.user?.id?.split(':')[0] || null;

        await execute(
          "UPDATE whatsapp_accounts SET status = 'connected', phone_number = COALESCE($1, phone_number), updated_at = NOW() WHERE id = $2",
          [phoneNumber, accountId]
        );

        io.to(`user:${userId}`).emit('account:status', {
          accountId,
          status: 'connected',
          phoneNumber,
        });
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue; // Skip outgoing messages

        await this.handleIncomingMessage(accountId, userId, msg);
      }
    });

    // Handle message status updates
    sock.ev.on('messages.update', async (updates) => {
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
  }

  private mapMessageStatus(status: number): string {
    switch (status) {
      case 0:
        return 'pending';
      case 1:
        return 'sent';
      case 2:
        return 'delivered';
      case 3:
      case 4:
        return 'read';
      default:
        return 'sent';
    }
  }

  private async handleIncomingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo
  ): Promise<void> {
    try {
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const waId = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const isGroup = remoteJid.endsWith('@g.us');

      // Skip group messages for now
      if (isGroup) return;

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
      }

      // Get or create conversation
      let conversation = await queryOne(
        'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2',
        [accountId, contact.id]
      );

      if (!conversation) {
        conversation = await queryOne(
          `INSERT INTO conversations (whatsapp_account_id, contact_id, unread_count, last_message_at)
           VALUES ($1, $2, 1, NOW())
           RETURNING *`,
          [accountId, contact.id]
        );
      } else {
        await execute(
          `UPDATE conversations
           SET unread_count = unread_count + 1, last_message_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [conversation.id]
        );
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
        // TODO: Download and store media
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
      }

      // Save message
      const savedMessage = await queryOne(
        `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status)
         VALUES ($1, $2, 'contact', $3, $4, $5, $6, 'delivered')
         RETURNING *`,
        [conversation.id, msg.key.id, contentType, content, mediaUrl, mediaMimeType]
      );

      // Emit to frontend
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
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  async sendMessage(accountId: string, waId: string, payload: MessagePayload): Promise<string> {
    const sock = this.sessions.get(accountId);
    if (!sock) {
      throw new Error('Session not found');
    }

    const jid = waId.includes('@') ? waId : `${waId}@s.whatsapp.net`;

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
          ptt: true, // Voice message
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

    return result?.key?.id || '';
  }

  async reconnectSession(accountId: string, userId: string): Promise<void> {
    // Destroy existing session if any
    await this.destroySession(accountId);

    // Create new session
    await this.createSession(accountId, userId);
  }

  async destroySession(accountId: string): Promise<void> {
    const sock = this.sessions.get(accountId);
    if (sock) {
      sock.end(undefined);
      this.sessions.delete(accountId);
    }
  }

  private cleanupSession(accountId: string): void {
    const sessionPath = path.join(this.sessionsDir, accountId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  }

  async restoreAllSessions(): Promise<void> {
    try {
      const accounts = await query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM whatsapp_accounts WHERE status != 'disconnected'"
      );

      console.log(`Restoring ${accounts.length} WhatsApp sessions...`);

      for (const account of accounts) {
        try {
          await this.createSession(account.id, account.user_id);
        } catch (error) {
          console.error(`Failed to restore session ${account.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to restore sessions:', error);
    }
  }

  getSession(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId);
  }
}

export const sessionManager = new SessionManager();
