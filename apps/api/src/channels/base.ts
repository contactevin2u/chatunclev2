import type {
  ChannelType,
  IncomingMessage,
  SendMessageParams,
  SendMediaParams,
  SendResult,
  ChannelConfig,
  ConnectionResult,
  ConnectionStatus,
} from '@chatuncle/shared';

// ============================================
// EVENT HANDLERS
// ============================================

export type MessageHandler = (message: IncomingMessage) => void | Promise<void>;
export type StatusHandler = (status: ConnectionStatus) => void | Promise<void>;
export type ConnectionHandler = (accountId: string, status: 'connected' | 'disconnected' | 'error', error?: string) => void | Promise<void>;
export type QRHandler = (accountId: string, qrCode: string) => void | Promise<void>;
export type PairingCodeHandler = (accountId: string, pairingCode: string) => void | Promise<void>;

// ============================================
// CHANNEL ADAPTER INTERFACE
// ============================================

/**
 * Base interface for all channel adapters
 * Implements a unified messaging API across different platforms
 */
export interface ChannelAdapter {
  /** Channel type identifier */
  readonly type: ChannelType;

  // === LIFECYCLE ===

  /**
   * Initialize the adapter with configuration
   */
  initialize(config: ChannelConfig): Promise<void>;

  /**
   * Connect an account to the channel
   * @param accountId - Unique account identifier
   * @param credentials - Channel-specific credentials
   * @returns Connection result with status
   */
  connect(accountId: string, credentials: unknown): Promise<ConnectionResult>;

  /**
   * Disconnect an account from the channel
   * @param accountId - Account to disconnect
   */
  disconnect(accountId: string): Promise<void>;

  /**
   * Gracefully shutdown all connections
   */
  shutdown(): Promise<void>;

  // === MESSAGING ===

  /**
   * Send a text or simple message
   */
  sendMessage(params: SendMessageParams): Promise<SendResult>;

  /**
   * Send a media message (image, video, audio, document)
   */
  sendMedia(params: SendMediaParams): Promise<SendResult>;

  // === STATUS ===

  /**
   * Get connection status for an account
   */
  getStatus(accountId: string): ConnectionStatus;

  /**
   * Check if an account is currently connected
   */
  isConnected(accountId: string): boolean;

  /**
   * Get list of all connected account IDs
   */
  getActiveAccounts(): string[];

  // === EVENTS ===

  /**
   * Register handler for incoming messages
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Register handler for status changes
   */
  onStatus(handler: StatusHandler): void;

  /**
   * Register handler for connection events
   */
  onConnection(handler: ConnectionHandler): void;
}

// ============================================
// WHATSAPP-SPECIFIC INTERFACE
// ============================================

export interface WhatsAppAdapter extends ChannelAdapter {
  readonly type: 'whatsapp';

  /**
   * Register handler for QR code events
   */
  onQR(handler: QRHandler): void;

  /**
   * Register handler for pairing code events
   */
  onPairingCode(handler: PairingCodeHandler): void;

  /**
   * Connect using pairing code instead of QR
   */
  connectWithPairingCode(accountId: string, phoneNumber: string): Promise<ConnectionResult>;

  /**
   * Send typing indicator
   */
  sendTyping(accountId: string, jid: string, duration?: number): Promise<void>;

  /**
   * Send read receipt
   */
  sendReadReceipt(accountId: string, jid: string, messageIds: string[]): Promise<void>;

  /**
   * Get group metadata
   */
  getGroupMetadata(accountId: string, groupJid: string): Promise<unknown>;

  /**
   * Get contact profile picture URL
   */
  getProfilePicture(accountId: string, jid: string): Promise<string | null>;
}

// ============================================
// TELEGRAM-SPECIFIC INTERFACE
// ============================================

export interface TelegramAdapter extends ChannelAdapter {
  readonly type: 'telegram';

  /**
   * Send inline keyboard
   */
  sendInlineKeyboard(
    accountId: string,
    chatId: string,
    text: string,
    keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  ): Promise<SendResult>;

  /**
   * Answer callback query (button press)
   */
  answerCallbackQuery(accountId: string, queryId: string, text?: string): Promise<void>;
}

// ============================================
// TIKTOK-SPECIFIC INTERFACE
// ============================================

export interface TikTokAdapter extends ChannelAdapter {
  readonly type: 'tiktok';

  /**
   * Refresh OAuth token
   */
  refreshToken(accountId: string): Promise<{ accessToken: string; refreshToken: string }>;

  /**
   * Get conversation list
   */
  getConversations(accountId: string): Promise<unknown[]>;
}

// ============================================
// META-SPECIFIC INTERFACE
// ============================================

export interface MetaAdapter extends ChannelAdapter {
  readonly type: 'instagram' | 'messenger';

  /**
   * Handle incoming webhook event
   */
  handleWebhook(accountId: string, event: unknown): void;

  /**
   * Send quick replies
   */
  sendQuickReplies(
    accountId: string,
    recipientId: string,
    text: string,
    replies: Array<{ title: string; payload: string }>
  ): Promise<SendResult>;

  /**
   * Send generic template
   */
  sendGenericTemplate(
    accountId: string,
    recipientId: string,
    elements: Array<{
      title: string;
      subtitle?: string;
      image_url?: string;
      buttons?: Array<{ type: string; title: string; payload?: string; url?: string }>;
    }>
  ): Promise<SendResult>;
}

// ============================================
// ABSTRACT BASE CLASS
// ============================================

/**
 * Abstract base class with common functionality
 */
export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;

  protected messageHandlers: MessageHandler[] = [];
  protected statusHandlers: StatusHandler[] = [];
  protected connectionHandlers: ConnectionHandler[] = [];

  abstract initialize(config: ChannelConfig): Promise<void>;
  abstract connect(accountId: string, credentials: unknown): Promise<ConnectionResult>;
  abstract disconnect(accountId: string): Promise<void>;
  abstract shutdown(): Promise<void>;
  abstract sendMessage(params: SendMessageParams): Promise<SendResult>;
  abstract sendMedia(params: SendMediaParams): Promise<SendResult>;
  abstract getStatus(accountId: string): ConnectionStatus;
  abstract isConnected(accountId: string): boolean;
  abstract getActiveAccounts(): string[];

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  onConnection(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  protected async emitMessage(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[${this.type}] Message handler error:`, error);
      }
    }
  }

  protected async emitStatus(status: ConnectionStatus): Promise<void> {
    for (const handler of this.statusHandlers) {
      try {
        await handler(status);
      } catch (error) {
        console.error(`[${this.type}] Status handler error:`, error);
      }
    }
  }

  protected async emitConnection(
    accountId: string,
    status: 'connected' | 'disconnected' | 'error',
    error?: string
  ): Promise<void> {
    for (const handler of this.connectionHandlers) {
      try {
        await handler(accountId, status, error);
      } catch (error) {
        console.error(`[${this.type}] Connection handler error:`, error);
      }
    }
  }
}
