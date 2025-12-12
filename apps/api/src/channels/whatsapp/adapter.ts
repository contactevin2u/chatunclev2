import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState,
  type proto,
  Browsers,
  isJidGroup,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import type {
  ChannelConfig,
  ConnectionResult,
  ConnectionStatus,
  SendMessageParams,
  SendMediaParams,
  SendResult,
  IncomingMessage,
  ContentType,
} from '@chatuncle/shared';
import { randomDelay, sleep } from '@chatuncle/shared';
import {
  BaseChannelAdapter,
  type WhatsAppAdapter,
  type QRHandler,
  type PairingCodeHandler,
} from '../base.js';
import { PostgresAuthState } from './auth.js';
import { MessageQueue } from './message-queue.js';
import { AntiBanService } from './anti-ban.js';
import { WHATSAPP_CONFIG, RATE_LIMITS } from '../../config/constants.js';
import { batchUpsertLidPnMappings } from '../../db/batch-operations.js';

/**
 * WhatsApp adapter implementation using Baileys v7
 */
export class WhatsAppAdapterImpl extends BaseChannelAdapter implements WhatsAppAdapter {
  readonly type = 'whatsapp' as const;

  private sessions = new Map<string, WASocket>();
  private authStates = new Map<string, PostgresAuthState>();
  private queues = new Map<string, MessageQueue>();
  private antiBan = new Map<string, AntiBanService>();
  private reconnectAttempts = new Map<string, number>();

  // Critical for Baileys v7: Message retry counter cache prevents decryption loops
  private msgRetryCounterCaches = new Map<string, NodeCache>();
  // Message cache for getMessage callback
  private messageCaches = new Map<string, NodeCache>();
  // Group metadata cache
  private groupMetadataCaches = new Map<string, NodeCache>();

  // Session ready state management
  private readyPromises = new Map<string, Promise<void>>();
  private readyResolvers = new Map<string, () => void>();
  private isShuttingDown = false;

  private qrHandlers: QRHandler[] = [];
  private pairingCodeHandlers: PairingCodeHandler[] = [];

  private config: ChannelConfig = {};

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    console.log('[WhatsApp] Adapter initialized');
  }

  async connect(accountId: string, credentials?: unknown): Promise<ConnectionResult> {
    if (this.isShuttingDown) {
      return { success: false, error: 'Adapter is shutting down' };
    }

    if (this.sessions.has(accountId)) {
      console.log(`[WhatsApp] Session ${accountId} already exists`);
      return { success: true, status: 'connected' };
    }

    try {
      console.log(`[WhatsApp] Creating session for ${accountId}`);

      // Create ready promise with 30-second timeout
      let resolveReady: () => void;
      const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        setTimeout(() => reject(new Error('Connection timeout')), 30000);
      });
      this.readyPromises.set(accountId, readyPromise);
      this.readyResolvers.set(accountId, resolveReady!);

      // Initialize auth state from PostgreSQL
      const authState = new PostgresAuthState(accountId);
      await authState.initialize();
      this.authStates.set(accountId, authState);

      // Initialize message queue and wire send handler
      const queue = new MessageQueue(accountId);
      queue.setSendHandler((params) => this.sendMessageDirect(params));
      this.queues.set(accountId, queue);

      // Initialize anti-ban service
      const antiBan = new AntiBanService(accountId);
      this.antiBan.set(accountId, antiBan);

      // Initialize caches (critical for Baileys v7)
      const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
      this.msgRetryCounterCaches.set(accountId, msgRetryCounterCache);

      const messageCache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // 10 min TTL
      this.messageCaches.set(accountId, messageCache);

      const groupMetadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min TTL
      this.groupMetadataCaches.set(accountId, groupMetadataCache);

      // Get latest Baileys version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp] Using Baileys v${version.join('.')} (latest: ${isLatest})`);

      // Create socket with critical v7 configurations
      const sock = makeWASocket({
        version,
        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, console),
        },
        browser: Browsers.ubuntu(WHATSAPP_CONFIG.BROWSER_NAME),
        printQRInTerminal: false,
        syncFullHistory: this.config.whatsapp?.syncHistory ?? WHATSAPP_CONFIG.SYNC_FULL_HISTORY,
        markOnlineOnConnect: WHATSAPP_CONFIG.MARK_ONLINE_ON_CONNECT,
        generateHighQualityLinkPreview: false, // Reduce overhead
        // Critical v7 configurations:
        msgRetryCounterCache, // Prevents decryption loops
        getMessage: async (key) => {
          // Try cache first, then return empty (Baileys will retry)
          const cached = messageCache.get<proto.IMessage>(key.id || '');
          if (cached) return cached;
          return undefined;
        },
        cachedGroupMetadata: async (jid) => {
          const cached = groupMetadataCache.get(jid);
          if (cached) return cached as Awaited<ReturnType<typeof sock.groupMetadata>>;
          // Fetch fresh and cache
          try {
            const metadata = await sock.groupMetadata(jid);
            groupMetadataCache.set(jid, metadata);
            return metadata;
          } catch {
            return undefined;
          }
        },
      });

      // Set up event handlers
      this.setupEventHandlers(accountId, sock, authState);

      // Store session
      this.sessions.set(accountId, sock);
      this.reconnectAttempts.set(accountId, 0);

      return { success: true, status: 'connecting' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WhatsApp] Failed to create session ${accountId}:`, error);
      return { success: false, error: message };
    }
  }

  async connectWithPairingCode(accountId: string, phoneNumber: string): Promise<ConnectionResult> {
    // First establish connection
    const result = await this.connect(accountId);
    if (!result.success) return result;

    const sock = this.sessions.get(accountId);
    if (!sock) {
      return { success: false, error: 'Session not found after connect' };
    }

    try {
      // Request pairing code
      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`[WhatsApp] Pairing code for ${accountId}: ${code}`);

      // Emit pairing code event
      for (const handler of this.pairingCodeHandlers) {
        handler(accountId, code);
      }

      return { success: true, status: 'connecting', pairingCode: code };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WhatsApp] Failed to get pairing code:`, error);
      return { success: false, error: message };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    console.log(`[WhatsApp] Disconnecting session ${accountId}`);

    const sock = this.sessions.get(accountId);
    if (sock) {
      try {
        await sock.logout();
      } catch (error) {
        console.error(`[WhatsApp] Error during logout:`, error);
      }
      sock.end(undefined);
    }

    this.cleanup(accountId);
  }

  async shutdown(): Promise<void> {
    console.log('[WhatsApp] Shutting down all sessions...');
    this.isShuttingDown = true;

    const disconnectPromises = Array.from(this.sessions.keys()).map(async (accountId) => {
      try {
        const sock = this.sessions.get(accountId);
        if (sock) {
          sock.end(undefined);
        }
        this.cleanup(accountId);
      } catch (error) {
        console.error(`[WhatsApp] Error shutting down ${accountId}:`, error);
      }
    });

    await Promise.all(disconnectPromises);
    console.log('[WhatsApp] All sessions shut down');
  }

  /**
   * Wait for session to be ready with timeout
   */
  async waitForReady(accountId: string, timeoutMs: number = 30000): Promise<boolean> {
    const readyPromise = this.readyPromises.get(accountId);
    if (!readyPromise) {
      return this.sessions.has(accountId); // Already connected or not started
    }

    try {
      await Promise.race([
        readyPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Wait timeout')), timeoutMs)
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    // Route through message queue for rate limiting and serial processing
    const queue = this.queues.get(params.accountId);
    if (!queue) {
      return { success: false, error: 'Message queue not initialized', retryable: true };
    }

    // Use queue for proper rate limiting
    return queue.enqueue(params, params.isReply ? 10 : 0); // Higher priority for replies
  }

  /**
   * Direct send method - called by the queue
   */
  private async sendMessageDirect(params: SendMessageParams): Promise<SendResult> {
    const sock = this.sessions.get(params.accountId);
    if (!sock) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    const antiBan = this.antiBan.get(params.accountId);
    if (!antiBan) {
      return { success: false, error: 'Anti-ban service not initialized' };
    }

    try {
      // Apply anti-ban delay
      const delay = params.isReply
        ? randomDelay(RATE_LIMITS.REPLY_MIN_DELAY_MS, RATE_LIMITS.REPLY_MAX_DELAY_MS)
        : randomDelay(RATE_LIMITS.BULK_MIN_DELAY_MS, RATE_LIMITS.BULK_MAX_DELAY_MS);

      await antiBan.waitForRateLimit(params.recipientId);
      await sleep(delay);

      // Send typing indicator
      await this.sendTyping(params.accountId, params.recipientId);

      // Build message content
      let messageContent: Parameters<typeof sock.sendMessage>[1];

      if (params.contentType === 'text') {
        messageContent = { text: params.content || '' };
      } else if (params.contentType === 'location') {
        const [lat, lng] = (params.content || '0,0').split(',').map(Number);
        messageContent = {
          location: { degreesLatitude: lat, degreesLongitude: lng },
        };
      } else {
        // For media types, use sendMedia
        return this.sendMediaDirect(params as SendMediaParams);
      }

      // Add quoted message if replying
      if (params.replyToMessageId) {
        (messageContent as any).quoted = {
          key: { remoteJid: params.recipientId, id: params.replyToMessageId },
        };
      }

      const result = await sock.sendMessage(params.recipientId, messageContent);

      return {
        success: true,
        messageId: result?.key?.id || undefined,
        timestamp: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WhatsApp] Send message error:`, error);
      return { success: false, error: message, retryable: true };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    // Route through message queue for rate limiting
    const queue = this.queues.get(params.accountId);
    if (!queue) {
      return { success: false, error: 'Message queue not initialized', retryable: true };
    }

    return queue.enqueue(params, params.isReply ? 10 : 0);
  }

  /**
   * Direct media send method - called by the queue
   */
  private async sendMediaDirect(params: SendMediaParams): Promise<SendResult> {
    const sock = this.sessions.get(params.accountId);
    if (!sock) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    const antiBan = this.antiBan.get(params.accountId);
    if (!antiBan) {
      return { success: false, error: 'Anti-ban service not initialized' };
    }

    try {
      // Apply anti-ban delay
      const delay = params.isReply
        ? randomDelay(RATE_LIMITS.REPLY_MIN_DELAY_MS, RATE_LIMITS.REPLY_MAX_DELAY_MS)
        : randomDelay(RATE_LIMITS.BULK_MIN_DELAY_MS, RATE_LIMITS.BULK_MAX_DELAY_MS);

      await antiBan.waitForRateLimit(params.recipientId);
      await sleep(delay);

      let messageContent: Parameters<typeof sock.sendMessage>[1];

      switch (params.contentType) {
        case 'image':
          messageContent = {
            image: { url: params.mediaUrl },
            caption: params.caption || params.content,
            mimetype: params.mediaMimeType,
          };
          break;

        case 'video':
          messageContent = {
            video: { url: params.mediaUrl },
            caption: params.caption || params.content,
            mimetype: params.mediaMimeType,
          };
          break;

        case 'audio':
          messageContent = {
            audio: { url: params.mediaUrl },
            mimetype: params.mediaMimeType,
            ptt: params.mediaMimeType?.includes('ogg'), // Voice note if OGG
          };
          break;

        case 'document':
          messageContent = {
            document: { url: params.mediaUrl },
            mimetype: params.mediaMimeType,
            fileName: params.mediaFileName,
            caption: params.caption || params.content,
          };
          break;

        case 'sticker':
          messageContent = {
            sticker: { url: params.mediaUrl },
          };
          break;

        default:
          return { success: false, error: `Unsupported media type: ${params.contentType}` };
      }

      // Add quoted message if replying
      if (params.replyToMessageId) {
        (messageContent as any).quoted = {
          key: { remoteJid: params.recipientId, id: params.replyToMessageId },
        };
      }

      const result = await sock.sendMessage(params.recipientId, messageContent);

      return {
        success: true,
        messageId: result?.key?.id || undefined,
        timestamp: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WhatsApp] Send media error:`, error);
      return { success: false, error: message, retryable: true };
    }
  }

  async sendTyping(accountId: string, jid: string, duration?: number): Promise<void> {
    const sock = this.sessions.get(accountId);
    if (!sock) return;

    try {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(duration || randomDelay(RATE_LIMITS.MIN_TYPING_MS, RATE_LIMITS.MAX_TYPING_MS));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
      console.error(`[WhatsApp] Typing indicator error:`, error);
    }
  }

  async sendReadReceipt(accountId: string, jid: string, messageIds: string[]): Promise<void> {
    const sock = this.sessions.get(accountId);
    if (!sock) return;

    try {
      await sock.readMessages([{ remoteJid: jid, id: messageIds[0]!, participant: undefined }]);
    } catch (error) {
      console.error(`[WhatsApp] Read receipt error:`, error);
    }
  }

  async getGroupMetadata(accountId: string, groupJid: string): Promise<unknown> {
    const sock = this.sessions.get(accountId);
    if (!sock) throw new Error('Session not connected');

    return sock.groupMetadata(groupJid);
  }

  async getProfilePicture(accountId: string, jid: string): Promise<string | null> {
    const sock = this.sessions.get(accountId);
    if (!sock) return null;

    try {
      return await sock.profilePictureUrl(jid, 'preview');
    } catch {
      return null;
    }
  }

  getStatus(accountId: string): ConnectionStatus {
    const sock = this.sessions.get(accountId);
    return {
      accountId,
      status: sock ? 'connected' : 'disconnected',
    };
  }

  isConnected(accountId: string): boolean {
    return this.sessions.has(accountId);
  }

  getActiveAccounts(): string[] {
    return Array.from(this.sessions.keys());
  }

  onQR(handler: QRHandler): void {
    this.qrHandlers.push(handler);
  }

  onPairingCode(handler: PairingCodeHandler): void {
    this.pairingCodeHandlers.push(handler);
  }

  // === PRIVATE METHODS ===

  private setupEventHandlers(
    accountId: string,
    sock: WASocket,
    authState: PostgresAuthState
  ): void {
    // Connection update
    sock.ev.on('connection.update', async (update) => {
      await this.handleConnectionUpdate(accountId, sock, update);
    });

    // Credentials update
    sock.ev.on('creds.update', async () => {
      await authState.saveCreds();
    });

    // Messages
    sock.ev.on('messages.upsert', async (data) => {
      await this.handleMessagesUpsert(accountId, data);
    });

    // Message status updates
    sock.ev.on('messages.update', async (updates) => {
      await this.handleMessagesUpdate(accountId, updates);
    });

    // Message reactions
    sock.ev.on('messages.reaction', async (reactions) => {
      await this.handleReactions(accountId, reactions);
    });

    // LID/PN mapping (Baileys v7) - Critical for deduplication
    sock.ev.on('messaging-history.set' as any, async (data: any) => {
      // Handle LID mappings from history sync if available
      if (data?.isLatest && data?.messages) {
        console.log(`[WhatsApp] Processing ${data.messages.length} history messages`);
      }
    });

    // Handle contacts with LID format
    sock.ev.on('contacts.upsert', async (contacts: any[]) => {
      await this.handleContactsUpsert(accountId, contacts);
    });

    // Group updates
    sock.ev.on('groups.update', async (groups) => {
      await this.handleGroupsUpdate(accountId, groups);
    });

    // Contacts update
    sock.ev.on('contacts.update', async (contacts) => {
      await this.handleContactsUpdate(accountId, contacts);
    });
  }

  private async handleConnectionUpdate(
    accountId: string,
    sock: WASocket,
    update: Partial<ConnectionState>
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    // Emit QR code
    if (qr) {
      console.log(`[WhatsApp] QR code received for ${accountId}`);
      for (const handler of this.qrHandlers) {
        handler(accountId, qr);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Connection closed for ${accountId}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        const attempts = (this.reconnectAttempts.get(accountId) || 0) + 1;
        this.reconnectAttempts.set(accountId, attempts);

        if (attempts <= 5) {
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
          console.log(`[WhatsApp] Reconnecting ${accountId} in ${delay}ms (attempt ${attempts})`);
          setTimeout(() => this.reconnect(accountId), delay);
        } else {
          console.log(`[WhatsApp] Max reconnect attempts reached for ${accountId}`);
          this.emitConnection(accountId, 'error', 'Max reconnect attempts reached');
        }
      } else {
        this.cleanup(accountId);
        this.emitConnection(accountId, 'disconnected');
      }
    } else if (connection === 'open') {
      console.log(`[WhatsApp] Connected: ${accountId}`);
      this.reconnectAttempts.set(accountId, 0);

      // Resolve ready promise
      const resolver = this.readyResolvers.get(accountId);
      if (resolver) {
        resolver();
        this.readyResolvers.delete(accountId);
      }

      this.emitConnection(accountId, 'connected');
      this.emitStatus({
        accountId,
        status: 'connected',
        lastConnectedAt: new Date(),
      });
    }
  }

  private async handleMessagesUpsert(
    accountId: string,
    data: { messages: proto.IWebMessageInfo[]; type: string }
  ): Promise<void> {
    const { messages, type } = data;
    const messageCache = this.messageCaches.get(accountId);

    for (const msg of messages) {
      // Skip status messages
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Cache message for getMessage callback (critical for v7 retries)
      if (messageCache && msg.key.id && msg.message) {
        messageCache.set(msg.key.id, msg.message);
      }

      // Transform to IncomingMessage
      const incoming = this.transformMessage(accountId, msg);
      if (incoming) {
        await this.emitMessage(incoming);
      }
    }
  }

  private async handleMessagesUpdate(
    accountId: string,
    updates: { key: proto.IMessageKey; update: Partial<proto.IWebMessageInfo> }[]
  ): Promise<void> {
    // Handle message status updates (sent, delivered, read)
    // This would emit status events
  }

  private async handleReactions(
    accountId: string,
    reactions: { key: proto.IMessageKey; reaction: proto.IReaction }[]
  ): Promise<void> {
    // Handle message reactions
  }

  private async handleGroupsUpdate(accountId: string, groups: unknown[]): Promise<void> {
    // Handle group metadata updates
  }

  private async handleContactsUpdate(accountId: string, contacts: unknown[]): Promise<void> {
    // Handle contact updates (name, profile pic changes)
  }

  private async handleContactsUpsert(accountId: string, contacts: any[]): Promise<void> {
    // Extract LID/PN mappings from contacts
    const mappings: Array<{ lid: string; pn: string }> = [];

    for (const contact of contacts) {
      // Baileys v7 contacts may have lid and id (phone number)
      if (contact.lid && contact.id) {
        mappings.push({
          lid: contact.lid,
          pn: contact.id.replace('@s.whatsapp.net', ''),
        });
      }
    }

    if (mappings.length > 0) {
      try {
        await batchUpsertLidPnMappings(accountId, mappings);
        console.log(`[WhatsApp] Stored ${mappings.length} LID/PN mappings for ${accountId}`);
      } catch (error) {
        console.error(`[WhatsApp] Failed to store LID mappings:`, error);
      }
    }
  }

  private transformMessage(
    accountId: string,
    msg: proto.IWebMessageInfo
  ): IncomingMessage | null {
    if (!msg.key.remoteJid || !msg.message) return null;

    const messageContent = msg.message;
    let contentType: ContentType = 'text';
    let content: string | undefined;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    // Determine content type and extract content
    if (messageContent.conversation) {
      contentType = 'text';
      content = messageContent.conversation;
    } else if (messageContent.extendedTextMessage) {
      contentType = 'text';
      content = messageContent.extendedTextMessage.text || undefined;
    } else if (messageContent.imageMessage) {
      contentType = 'image';
      content = messageContent.imageMessage.caption || undefined;
      mediaMimeType = messageContent.imageMessage.mimetype || undefined;
    } else if (messageContent.videoMessage) {
      contentType = 'video';
      content = messageContent.videoMessage.caption || undefined;
      mediaMimeType = messageContent.videoMessage.mimetype || undefined;
    } else if (messageContent.audioMessage) {
      contentType = 'audio';
      mediaMimeType = messageContent.audioMessage.mimetype || undefined;
    } else if (messageContent.documentMessage) {
      contentType = 'document';
      content = messageContent.documentMessage.caption || undefined;
      mediaMimeType = messageContent.documentMessage.mimetype || undefined;
    } else if (messageContent.stickerMessage) {
      contentType = 'sticker';
      mediaMimeType = messageContent.stickerMessage.mimetype || undefined;
    } else if (messageContent.locationMessage) {
      contentType = 'location';
      const loc = messageContent.locationMessage;
      content = `${loc.degreesLatitude},${loc.degreesLongitude}`;
    } else {
      // Unsupported message type
      return null;
    }

    const isGroup = isJidGroup(msg.key.remoteJid);
    const senderId = msg.key.participant || msg.key.remoteJid;

    return {
      channelType: 'whatsapp',
      channelAccountId: accountId,
      channelMessageId: msg.key.id || '',
      chatId: msg.key.remoteJid,
      isGroup,
      groupId: isGroup ? msg.key.remoteJid : undefined,
      senderId: senderId || '',
      senderName: msg.pushName || undefined,
      contentType,
      content,
      mediaUrl,
      mediaMimeType,
      replyToMessageId: (messageContent as any).contextInfo?.stanzaId,
      replyToContent: (messageContent as any).contextInfo?.quotedMessage?.conversation,
      timestamp: new Date((msg.messageTimestamp as number) * 1000),
      isFromMe: msg.key.fromMe || false,
      rawMessage: msg,
    };
  }

  private async reconnect(accountId: string): Promise<void> {
    const authState = this.authStates.get(accountId);
    if (!authState) {
      console.error(`[WhatsApp] Cannot reconnect ${accountId}: No auth state`);
      return;
    }

    // Clean up existing session but keep auth state
    const sock = this.sessions.get(accountId);
    if (sock) {
      sock.end(undefined);
      this.sessions.delete(accountId);
    }

    // Reconnect
    await this.connect(accountId);
  }

  private cleanup(accountId: string): void {
    this.sessions.delete(accountId);
    this.authStates.delete(accountId);
    this.queues.delete(accountId);
    this.antiBan.delete(accountId);
    this.reconnectAttempts.delete(accountId);
    // Clean up caches
    this.msgRetryCounterCaches.get(accountId)?.close();
    this.msgRetryCounterCaches.delete(accountId);
    this.messageCaches.get(accountId)?.close();
    this.messageCaches.delete(accountId);
    this.groupMetadataCaches.get(accountId)?.close();
    this.groupMetadataCaches.delete(accountId);
    // Clean up ready state
    this.readyPromises.delete(accountId);
    this.readyResolvers.delete(accountId);
  }
}
