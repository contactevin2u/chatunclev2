/**
 * Channel Adapter Factory
 * Manages registration and retrieval of channel adapters
 */

import { IChannelAdapter, MessageHandler, StatusChangeHandler, QRCodeHandler } from './IChannelAdapter';
import { ChannelType, IncomingMessage, ConnectionStatus } from './types';

/**
 * ChannelAdapterFactory - Singleton factory for managing channel adapters
 *
 * Usage:
 *   // Register adapters at startup
 *   ChannelAdapterFactory.register(new TelegramAdapter());
 *   ChannelAdapterFactory.register(new WhatsAppAdapter());
 *
 *   // Get adapter by channel type
 *   const telegram = ChannelAdapterFactory.get('telegram');
 *   await telegram.sendMessage(accountId, chatId, { type: 'text', content: 'Hello!' });
 */
export class ChannelAdapterFactory {
  private static adapters: Map<ChannelType, IChannelAdapter> = new Map();
  private static globalMessageHandlers: MessageHandler[] = [];
  private static globalStatusHandlers: StatusChangeHandler[] = [];
  private static globalQRHandlers: QRCodeHandler[] = [];
  private static initialized = false;

  /**
   * Register a channel adapter
   * @param adapter - The adapter instance to register
   */
  static register(adapter: IChannelAdapter): void {
    const channelType = adapter.channelType;

    if (this.adapters.has(channelType)) {
      console.warn(`[ChannelFactory] Replacing existing adapter for ${channelType}`);
    }

    // Wire up global handlers to this adapter
    for (const handler of this.globalMessageHandlers) {
      adapter.onMessage(handler);
    }
    for (const handler of this.globalStatusHandlers) {
      adapter.onStatusChange(handler);
    }
    if (adapter.onQRCode) {
      for (const handler of this.globalQRHandlers) {
        adapter.onQRCode(handler);
      }
    }

    this.adapters.set(channelType, adapter);
    console.log(`[ChannelFactory] Registered adapter: ${channelType}`);
  }

  /**
   * Unregister a channel adapter
   * @param channelType - The channel type to unregister
   */
  static unregister(channelType: ChannelType): void {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      adapter.shutdown().catch(err => {
        console.error(`[ChannelFactory] Error shutting down ${channelType}:`, err);
      });
      this.adapters.delete(channelType);
      console.log(`[ChannelFactory] Unregistered adapter: ${channelType}`);
    }
  }

  /**
   * Get a registered adapter by channel type
   * @param channelType - The channel type
   * @throws Error if adapter not found
   */
  static get(channelType: ChannelType): IChannelAdapter {
    const adapter = this.adapters.get(channelType);
    if (!adapter) {
      throw new Error(`[ChannelFactory] No adapter registered for channel: ${channelType}`);
    }
    return adapter;
  }

  /**
   * Get a registered adapter if it exists (returns null if not found)
   * @param channelType - The channel type
   */
  static getOrNull(channelType: ChannelType): IChannelAdapter | null {
    return this.adapters.get(channelType) || null;
  }

  /**
   * Check if an adapter is registered
   * @param channelType - The channel type
   */
  static has(channelType: ChannelType): boolean {
    return this.adapters.has(channelType);
  }

  /**
   * Get all registered channel types
   */
  static getRegisteredChannels(): ChannelType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters
   */
  static getAll(): IChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Register a global message handler that will receive messages from ALL channels
   * @param handler - Message handler callback
   */
  static onMessage(handler: MessageHandler): void {
    this.globalMessageHandlers.push(handler);
    // Also register with existing adapters
    for (const adapter of this.adapters.values()) {
      adapter.onMessage(handler);
    }
  }

  /**
   * Register a global status change handler for ALL channels
   * @param handler - Status change callback
   */
  static onStatusChange(handler: StatusChangeHandler): void {
    this.globalStatusHandlers.push(handler);
    for (const adapter of this.adapters.values()) {
      adapter.onStatusChange(handler);
    }
  }

  /**
   * Register a global QR code handler (for WhatsApp)
   * @param handler - QR code callback
   */
  static onQRCode(handler: QRCodeHandler): void {
    this.globalQRHandlers.push(handler);
    for (const adapter of this.adapters.values()) {
      if (adapter.onQRCode) {
        adapter.onQRCode(handler);
      }
    }
  }

  /**
   * Shutdown all adapters gracefully
   */
  static async shutdownAll(): Promise<void> {
    console.log('[ChannelFactory] Shutting down all adapters...');
    const shutdownPromises = Array.from(this.adapters.values()).map(adapter =>
      adapter.shutdown().catch(err => {
        console.error(`[ChannelFactory] Error shutting down ${adapter.channelType}:`, err);
      })
    );
    await Promise.all(shutdownPromises);
    this.adapters.clear();
    console.log('[ChannelFactory] All adapters shut down');
  }

  /**
   * Get status of all connected accounts across all channels
   */
  static getAllAccountStatuses(): Array<{
    channelType: ChannelType;
    accountId: string;
    status: ConnectionStatus;
  }> {
    const statuses: Array<{ channelType: ChannelType; accountId: string; status: ConnectionStatus }> = [];

    for (const adapter of this.adapters.values()) {
      for (const accountId of adapter.getActiveAccounts()) {
        statuses.push({
          channelType: adapter.channelType,
          accountId,
          status: adapter.getStatus(accountId),
        });
      }
    }

    return statuses;
  }

  /**
   * Initialize the factory (called at app startup)
   */
  static markInitialized(): void {
    this.initialized = true;
    console.log('[ChannelFactory] Initialized with adapters:', this.getRegisteredChannels().join(', '));
  }

  /**
   * Check if factory is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }
}
