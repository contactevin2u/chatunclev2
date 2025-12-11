/**
 * Channel Adapter Interface
 * All channel adapters (WhatsApp, Telegram, Instagram, etc.) must implement this interface
 */

import {
  ChannelType,
  ConnectionStatus,
  MessagePayload,
  IncomingMessage,
  ContactProfile,
  SendMessageResult,
} from './types';

export interface ConnectionOptions {
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
}

export interface SendOptions {
  replyToMessageId?: string;
  metadata?: Record<string, any>;
}

/**
 * Event handler types for channel adapters
 */
export type MessageHandler = (message: IncomingMessage) => Promise<void>;
export type StatusChangeHandler = (accountId: string, status: ConnectionStatus, error?: string) => void;
export type QRCodeHandler = (accountId: string, qr: string) => void;

/**
 * IChannelAdapter - Abstract interface for all messaging channel adapters
 *
 * Each adapter handles:
 * - Connection management (connect, disconnect, reconnect)
 * - Message sending (text, media, location)
 * - Incoming message handling via callbacks
 * - Contact profile fetching
 * - Channel-specific features
 */
export interface IChannelAdapter {
  /**
   * The type of channel this adapter handles
   */
  readonly channelType: ChannelType;

  /**
   * Connect to the channel for a specific account
   * @param accountId - Internal account ID
   * @param options - Connection options including credentials
   */
  connect(accountId: string, options: ConnectionOptions): Promise<void>;

  /**
   * Disconnect from the channel
   * @param accountId - Internal account ID
   */
  disconnect(accountId: string): Promise<void>;

  /**
   * Get current connection status for an account
   * @param accountId - Internal account ID
   */
  getStatus(accountId: string): ConnectionStatus;

  /**
   * Check if account is connected and ready to send/receive
   * @param accountId - Internal account ID
   */
  isConnected(accountId: string): boolean;

  /**
   * Send a message to a recipient
   * @param accountId - Internal account ID
   * @param recipientId - Channel-specific recipient ID (phone, chat_id, etc.)
   * @param message - Message payload
   * @param options - Send options (reply, etc.)
   */
  sendMessage(
    accountId: string,
    recipientId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Promise<SendMessageResult>;

  /**
   * Get contact profile information
   * @param accountId - Internal account ID
   * @param contactId - Channel-specific contact ID
   */
  getContactProfile(accountId: string, contactId: string): Promise<ContactProfile | null>;

  /**
   * Register handler for incoming messages
   * @param handler - Callback for incoming messages
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Register handler for connection status changes
   * @param handler - Callback for status changes
   */
  onStatusChange(handler: StatusChangeHandler): void;

  /**
   * Register handler for QR codes (WhatsApp only, optional)
   * @param handler - Callback for QR code updates
   */
  onQRCode?(handler: QRCodeHandler): void;

  /**
   * Get all active account IDs for this adapter
   */
  getActiveAccounts(): string[];

  /**
   * Cleanup resources on shutdown
   */
  shutdown(): Promise<void>;
}

/**
 * Base class with common functionality for channel adapters
 * Adapters can extend this for shared behavior
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channelType: ChannelType;

  protected messageHandlers: MessageHandler[] = [];
  protected statusChangeHandlers: StatusChangeHandler[] = [];
  protected qrCodeHandlers: QRCodeHandler[] = [];
  protected accountStatuses: Map<string, ConnectionStatus> = new Map();

  abstract connect(accountId: string, options: ConnectionOptions): Promise<void>;
  abstract disconnect(accountId: string): Promise<void>;
  abstract sendMessage(
    accountId: string,
    recipientId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Promise<SendMessageResult>;
  abstract getContactProfile(accountId: string, contactId: string): Promise<ContactProfile | null>;
  abstract getActiveAccounts(): string[];
  abstract shutdown(): Promise<void>;

  getStatus(accountId: string): ConnectionStatus {
    return this.accountStatuses.get(accountId) || 'disconnected';
  }

  isConnected(accountId: string): boolean {
    return this.getStatus(accountId) === 'connected';
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatusChange(handler: StatusChangeHandler): void {
    this.statusChangeHandlers.push(handler);
  }

  onQRCode(handler: QRCodeHandler): void {
    this.qrCodeHandlers.push(handler);
  }

  /**
   * Emit incoming message to all registered handlers
   */
  protected async emitMessage(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[${this.channelType}] Message handler error:`, error);
      }
    }
  }

  /**
   * Emit status change to all registered handlers
   */
  protected emitStatusChange(accountId: string, status: ConnectionStatus, error?: string): void {
    this.accountStatuses.set(accountId, status);
    for (const handler of this.statusChangeHandlers) {
      try {
        handler(accountId, status, error);
      } catch (err) {
        console.error(`[${this.channelType}] Status change handler error:`, err);
      }
    }
  }

  /**
   * Emit QR code to all registered handlers
   */
  protected emitQRCode(accountId: string, qr: string): void {
    for (const handler of this.qrCodeHandlers) {
      try {
        handler(accountId, qr);
      } catch (error) {
        console.error(`[${this.channelType}] QR code handler error:`, error);
      }
    }
  }
}
