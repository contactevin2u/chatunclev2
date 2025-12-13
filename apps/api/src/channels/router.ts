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
import type { ChannelAdapter, MessageHandler, StatusHandler, ConnectionHandler, QRHandler } from './base.js';

// Import adapters
import { WhatsAppAdapterImpl } from './whatsapp/adapter.js';
import { TelegramAdapterImpl } from './telegram/adapter.js';
import { TikTokAdapterImpl } from './tiktok/adapter.js';
import { MetaAdapterImpl } from './meta/adapter.js';

/**
 * Unified channel router that manages all channel adapters
 * Routes messages and operations to the appropriate channel
 */
export class ChannelRouter {
  private adapters = new Map<ChannelType, ChannelAdapter>();
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private qrHandlers: QRHandler[] = [];
  private initialized = false;

  /**
   * Initialize all channel adapters
   */
  async initialize(config: ChannelConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[ChannelRouter] Already initialized');
      return;
    }

    console.log('[ChannelRouter] Initializing channel adapters...');

    // Initialize all channel adapters
    const whatsapp = new WhatsAppAdapterImpl();
    const telegram = new TelegramAdapterImpl();
    const tiktok = new TikTokAdapterImpl();
    const instagram = new MetaAdapterImpl('instagram');
    const messenger = new MetaAdapterImpl('messenger');

    const adapters: ChannelAdapter[] = [whatsapp, telegram, tiktok, instagram, messenger];

    for (const adapter of adapters) {
      try {
        await adapter.initialize(config);

        // Register handlers
        adapter.onMessage(async (message) => {
          await this.handleIncomingMessage(message);
        });

        adapter.onStatus(async (status) => {
          await this.handleStatusChange(status);
        });

        adapter.onConnection(async (accountId, status, error) => {
          await this.handleConnectionChange(accountId, status, error);
        });

        // Register QR handler for WhatsApp (only WhatsApp has onQR)
        if ('onQR' in adapter && typeof adapter.onQR === 'function') {
          adapter.onQR(async (accountId: string, qrCode: string) => {
            await this.handleQRCode(accountId, qrCode);
          });
        }

        this.adapters.set(adapter.type, adapter);
        console.log(`[ChannelRouter] ${adapter.type} adapter initialized`);
      } catch (error) {
        console.error(`[ChannelRouter] Failed to initialize ${adapter.type}:`, error);
      }
    }

    this.initialized = true;
    console.log(`[ChannelRouter] Initialized ${this.adapters.size} adapters`);
  }

  /**
   * Connect an account to its channel
   */
  async connectAccount(
    accountId: string,
    channelType: ChannelType,
    credentials: unknown
  ): Promise<ConnectionResult> {
    const adapter = this.adapters.get(channelType);
    if (!adapter) {
      return {
        success: false,
        error: `Channel adapter not found: ${channelType}`,
      };
    }

    try {
      return await adapter.connect(accountId, credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Disconnect an account
   */
  async disconnectAccount(accountId: string, channelType: ChannelType): Promise<void> {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      await adapter.disconnect(accountId);
    }
  }

  /**
   * Send a message through the appropriate channel
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const adapter = this.adapters.get(params.channelType);
    if (!adapter) {
      return {
        success: false,
        error: `Channel adapter not found: ${params.channelType}`,
      };
    }

    try {
      return await adapter.sendMessage(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
        retryable: true,
      };
    }
  }

  /**
   * Send media through the appropriate channel
   */
  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    const adapter = this.adapters.get(params.channelType);
    if (!adapter) {
      return {
        success: false,
        error: `Channel adapter not found: ${params.channelType}`,
      };
    }

    try {
      return await adapter.sendMedia(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
        retryable: true,
      };
    }
  }

  /**
   * Get connection status for an account
   */
  getStatus(accountId: string, channelType: ChannelType): ConnectionStatus | null {
    const adapter = this.adapters.get(channelType);
    if (!adapter) return null;
    return adapter.getStatus(accountId);
  }

  /**
   * Check if an account is connected
   */
  isConnected(accountId: string, channelType: ChannelType): boolean {
    const adapter = this.adapters.get(channelType);
    if (!adapter) return false;
    return adapter.isConnected(accountId);
  }

  /**
   * Get all active accounts for a channel type
   */
  getActiveAccounts(channelType: ChannelType): string[] {
    const adapter = this.adapters.get(channelType);
    if (!adapter) return [];
    return adapter.getActiveAccounts();
  }

  /**
   * Get all active accounts across all channels
   */
  getAllActiveAccounts(): Array<{ accountId: string; channelType: ChannelType }> {
    const result: Array<{ accountId: string; channelType: ChannelType }> = [];

    for (const [channelType, adapter] of this.adapters) {
      const accountIds = adapter.getActiveAccounts();
      for (const accountId of accountIds) {
        result.push({ accountId, channelType });
      }
    }

    return result;
  }

  /**
   * Get a specific adapter
   */
  getAdapter<T extends ChannelAdapter>(channelType: ChannelType): T | undefined {
    return this.adapters.get(channelType) as T | undefined;
  }

  /**
   * Register handler for incoming messages
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register handler for status changes
   */
  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Register handler for connection events
   */
  onConnection(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  /**
   * Register handler for QR code events
   */
  onQR(handler: QRHandler): void {
    this.qrHandlers.push(handler);
  }

  /**
   * Gracefully shutdown all adapters
   */
  async shutdown(): Promise<void> {
    console.log('[ChannelRouter] Shutting down...');

    const shutdownPromises = Array.from(this.adapters.values()).map(async (adapter) => {
      try {
        await adapter.shutdown();
        console.log(`[ChannelRouter] ${adapter.type} shutdown complete`);
      } catch (error) {
        console.error(`[ChannelRouter] Error shutting down ${adapter.type}:`, error);
      }
    });

    await Promise.all(shutdownPromises);
    this.adapters.clear();
    this.initialized = false;

    console.log('[ChannelRouter] Shutdown complete');
  }

  // === PRIVATE METHODS ===

  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error('[ChannelRouter] Message handler error:', error);
      }
    }
  }

  private async handleStatusChange(status: ConnectionStatus): Promise<void> {
    for (const handler of this.statusHandlers) {
      try {
        await handler(status);
      } catch (error) {
        console.error('[ChannelRouter] Status handler error:', error);
      }
    }
  }

  private async handleConnectionChange(
    accountId: string,
    status: 'connected' | 'disconnected' | 'error',
    error?: string
  ): Promise<void> {
    for (const handler of this.connectionHandlers) {
      try {
        await handler(accountId, status, error);
      } catch (error) {
        console.error('[ChannelRouter] Connection handler error:', error);
      }
    }
  }

  private async handleQRCode(accountId: string, qrCode: string): Promise<void> {
    for (const handler of this.qrHandlers) {
      try {
        await handler(accountId, qrCode);
      } catch (error) {
        console.error('[ChannelRouter] QR handler error:', error);
      }
    }
  }
}

// Singleton instance
let channelRouter: ChannelRouter | null = null;

export function getChannelRouter(): ChannelRouter {
  if (!channelRouter) {
    channelRouter = new ChannelRouter();
  }
  return channelRouter;
}

export function destroyChannelRouter(): void {
  if (channelRouter) {
    channelRouter.shutdown();
    channelRouter = null;
  }
}
