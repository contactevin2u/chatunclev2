/**
 * Multi-Channel Support
 * Unified interface for WhatsApp, Telegram, Instagram, Messenger, TikTok
 */

// Types
export * from './types';

// Interface and base class
export {
  IChannelAdapter,
  BaseChannelAdapter,
  ConnectionOptions,
  SendOptions,
  MessageHandler,
  StatusChangeHandler,
  QRCodeHandler,
} from './IChannelAdapter';

// Factory
export { ChannelAdapterFactory } from './ChannelAdapterFactory';

// Adapters
export { TelegramAdapter, telegramAdapter } from './adapters/TelegramAdapter';
export { TikTokAdapter, tiktokAdapter } from './adapters/TikTokAdapter';
export { MetaAdapter, instagramAdapter, messengerAdapter } from './adapters/MetaAdapter';
// export { WhatsAppAdapter } from './adapters/WhatsAppAdapter';
