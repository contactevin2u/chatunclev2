/**
 * Telegram Adapter
 * Uses grammY library for Telegram Bot API
 *
 * Key differences from WhatsApp:
 * - Official API with bot tokens (no reverse engineering)
 * - Very low ban risk (just respect rate limits)
 * - Long polling or webhooks for updates
 * - chat_id for conversations (can be user ID for 1:1 or group ID)
 * - No QR code needed, just bot token from @BotFather
 */

import { Bot, Context, GrammyError, HttpError } from 'grammy';
import {
  BaseChannelAdapter,
  ConnectionOptions,
  SendOptions,
} from '../IChannelAdapter';
import {
  ChannelType,
  ConnectionStatus,
  MessagePayload,
  IncomingMessage,
  ContactProfile,
  SendMessageResult,
} from '../types';

interface TelegramBotInstance {
  bot: Bot;
  accountId: string;
  botToken: string;
  botInfo: { id: number; username: string; firstName: string };
  startedAt: Date;
}

// Global rate limiter state (30 messages/second across all chats)
interface GlobalRateLimitState {
  timestamps: number[]; // Rolling window of message timestamps
  maxPerSecond: number;
}

/**
 * TelegramAdapter - Handles Telegram bot messaging
 *
 * Rate Limits:
 * - 1 message/second to same chat (we add 1100ms delay)
 * - 30 messages/second total (distributed across chats)
 * - 20 messages/minute to groups
 *
 * Ban Risk: VERY LOW
 * - Only risk is ignoring 429 errors
 * - grammY has built-in auto-retry
 */
export class TelegramAdapter extends BaseChannelAdapter {
  readonly channelType: ChannelType = 'telegram';

  private bots: Map<string, TelegramBotInstance> = new Map();
  private lastMessageTime: Map<string, number> = new Map(); // accountId:chatId -> timestamp
  private globalRateLimit: GlobalRateLimitState = {
    timestamps: [],
    maxPerSecond: 30, // Telegram's global limit
  };

  constructor() {
    super();
    console.log('[Telegram] Adapter initialized');
  }

  /**
   * Connect a Telegram bot account
   * @param accountId - Internal account ID
   * @param options - Must include credentials.botToken
   */
  async connect(accountId: string, options: ConnectionOptions): Promise<void> {
    const botToken = options.credentials?.botToken;

    if (!botToken) {
      throw new Error('[Telegram] Bot token required in credentials');
    }

    // Check if already connected
    if (this.bots.has(accountId)) {
      console.log(`[Telegram] Account ${accountId} already connected, disconnecting first...`);
      await this.disconnect(accountId);
    }

    console.log(`[Telegram] Connecting account ${accountId}...`);
    this.emitStatusChange(accountId, 'connecting');

    try {
      // Create bot instance
      const bot = new Bot(botToken);

      // Get bot info to validate token
      const botInfo = await bot.api.getMe();
      console.log(`[Telegram] Bot connected: @${botInfo.username} (${botInfo.first_name})`);

      // Set up message handlers
      this.setupMessageHandlers(bot, accountId);

      // Start long polling (non-blocking)
      bot.start({
        onStart: () => {
          console.log(`[Telegram] Long polling started for @${botInfo.username}`);
        },
      });

      // Store bot instance
      this.bots.set(accountId, {
        bot,
        accountId,
        botToken,
        botInfo: {
          id: botInfo.id,
          username: botInfo.username || '',
          firstName: botInfo.first_name,
        },
        startedAt: new Date(),
      });

      this.emitStatusChange(accountId, 'connected');
      console.log(`[Telegram] Account ${accountId} connected successfully`);
    } catch (error) {
      console.error(`[Telegram] Failed to connect account ${accountId}:`, error);
      this.emitStatusChange(accountId, 'error', error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  }

  /**
   * Disconnect a Telegram bot account
   */
  async disconnect(accountId: string): Promise<void> {
    const instance = this.bots.get(accountId);
    if (!instance) {
      console.log(`[Telegram] Account ${accountId} not found`);
      return;
    }

    console.log(`[Telegram] Disconnecting account ${accountId}...`);

    try {
      await instance.bot.stop();
    } catch (error) {
      console.error(`[Telegram] Error stopping bot ${accountId}:`, error);
    }

    this.bots.delete(accountId);
    this.emitStatusChange(accountId, 'disconnected');
    console.log(`[Telegram] Account ${accountId} disconnected`);
  }

  /**
   * Send a message via Telegram
   */
  async sendMessage(
    accountId: string,
    recipientId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Promise<SendMessageResult> {
    const instance = this.bots.get(accountId);
    if (!instance) {
      return { success: false, error: 'Bot not connected' };
    }

    const chatId = recipientId; // In Telegram, recipientId is the chat_id

    try {
      // Rate limiting: 30 messages/second globally + 1 message/second to same chat
      await this.enforceGlobalRateLimit();
      await this.enforceRateLimit(accountId, chatId);

      let sentMessage;

      // Send based on message type
      switch (message.type) {
        case 'text':
          sentMessage = await instance.bot.api.sendMessage(chatId, message.content || '', {
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'image':
          if (!message.mediaUrl) {
            return { success: false, error: 'Image URL required' };
          }
          sentMessage = await instance.bot.api.sendPhoto(chatId, message.mediaUrl, {
            caption: message.caption,
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'video':
          if (!message.mediaUrl) {
            return { success: false, error: 'Video URL required' };
          }
          sentMessage = await instance.bot.api.sendVideo(chatId, message.mediaUrl, {
            caption: message.caption,
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'audio':
          if (!message.mediaUrl) {
            return { success: false, error: 'Audio URL required' };
          }
          sentMessage = await instance.bot.api.sendAudio(chatId, message.mediaUrl, {
            caption: message.caption,
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'document':
          if (!message.mediaUrl) {
            return { success: false, error: 'Document URL required' };
          }
          sentMessage = await instance.bot.api.sendDocument(chatId, message.mediaUrl, {
            caption: message.caption,
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'location':
          if (message.latitude === undefined || message.longitude === undefined) {
            return { success: false, error: 'Latitude and longitude required' };
          }
          sentMessage = await instance.bot.api.sendLocation(chatId, message.latitude, message.longitude, {
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        case 'sticker':
          if (!message.mediaUrl) {
            return { success: false, error: 'Sticker file_id or URL required' };
          }
          sentMessage = await instance.bot.api.sendSticker(chatId, message.mediaUrl, {
            reply_to_message_id: options?.replyToMessageId ? parseInt(options.replyToMessageId) : undefined,
          });
          break;

        default:
          return { success: false, error: `Unsupported message type: ${message.type}` };
      }

      console.log(`[Telegram] Message sent to ${chatId}: ${sentMessage.message_id}`);

      return {
        success: true,
        messageId: sentMessage.message_id.toString(),
      };
    } catch (error) {
      console.error(`[Telegram] Failed to send message to ${chatId}:`, error);

      if (error instanceof GrammyError) {
        // Handle specific Telegram errors
        if (error.error_code === 403) {
          return { success: false, error: 'Bot was blocked by user' };
        }
        if (error.error_code === 429) {
          return { success: false, error: 'Rate limited, please try again later' };
        }
        return { success: false, error: error.description };
      }

      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get contact profile from Telegram
   */
  async getContactProfile(accountId: string, contactId: string): Promise<ContactProfile | null> {
    const instance = this.bots.get(accountId);
    if (!instance) {
      return null;
    }

    try {
      // For users, we can get chat info
      const chat = await instance.bot.api.getChat(contactId);

      // Handle different chat types
      if (chat.type === 'private') {
        const user = chat as any; // Private chat has user info
        return {
          channelUserId: contactId,
          displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined,
          username: user.username,
          profilePicUrl: undefined, // Would need getUserProfilePhotos API call
          metadata: {
            telegramId: user.id,
            isBot: user.is_bot,
            languageCode: user.language_code,
          },
        };
      } else if (chat.type === 'group' || chat.type === 'supergroup') {
        return {
          channelUserId: contactId,
          displayName: (chat as any).title,
          username: (chat as any).username,
          metadata: {
            telegramId: chat.id,
            chatType: chat.type,
          },
        };
      }

      return null;
    } catch (error) {
      console.error(`[Telegram] Failed to get contact profile for ${contactId}:`, error);
      return null;
    }
  }

  /**
   * Get all active account IDs
   */
  getActiveAccounts(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Shutdown all bot connections
   */
  async shutdown(): Promise<void> {
    console.log('[Telegram] Shutting down all bots...');
    const disconnectPromises = Array.from(this.bots.keys()).map(accountId =>
      this.disconnect(accountId)
    );
    await Promise.all(disconnectPromises);
    console.log('[Telegram] All bots shut down');
  }

  /**
   * Get bot info for an account
   */
  getBotInfo(accountId: string): { id: number; username: string; firstName: string } | null {
    const instance = this.bots.get(accountId);
    return instance?.botInfo || null;
  }

  // ==================== Private Methods ====================

  /**
   * Set up message handlers for incoming Telegram messages
   */
  private setupMessageHandlers(bot: Bot, accountId: string): void {
    // Handle all messages
    bot.on('message', async (ctx: Context) => {
      try {
        const msg = ctx.message!;
        const chat = ctx.chat!;
        const from = msg.from!;

        // Determine message type and content
        let contentType: IncomingMessage['contentType'] = 'text';
        let content: string | undefined;
        let mediaUrl: string | undefined;
        let mediaMimeType: string | undefined;
        let caption: string | undefined;

        if (msg.text) {
          contentType = 'text';
          content = msg.text;
        } else if (msg.photo) {
          contentType = 'image';
          // Get the largest photo (last in array)
          const photo = msg.photo[msg.photo.length - 1];
          mediaUrl = await this.getFileUrl(bot, photo.file_id);
          caption = msg.caption;
        } else if (msg.video) {
          contentType = 'video';
          mediaUrl = await this.getFileUrl(bot, msg.video.file_id);
          mediaMimeType = msg.video.mime_type;
          caption = msg.caption;
        } else if (msg.audio) {
          contentType = 'audio';
          mediaUrl = await this.getFileUrl(bot, msg.audio.file_id);
          mediaMimeType = msg.audio.mime_type;
          caption = msg.caption;
        } else if (msg.document) {
          contentType = 'document';
          mediaUrl = await this.getFileUrl(bot, msg.document.file_id);
          mediaMimeType = msg.document.mime_type;
          caption = msg.caption;
        } else if (msg.location) {
          contentType = 'location';
          content = `${msg.location.latitude},${msg.location.longitude}`;
        } else if (msg.sticker) {
          contentType = 'sticker';
          mediaUrl = await this.getFileUrl(bot, msg.sticker.file_id);
        } else if (msg.voice) {
          // Voice messages (audio notes)
          contentType = 'audio';
          mediaUrl = await this.getFileUrl(bot, msg.voice.file_id);
          mediaMimeType = msg.voice.mime_type || 'audio/ogg';
        } else if (msg.video_note) {
          // Video notes (circular videos)
          contentType = 'video';
          mediaUrl = await this.getFileUrl(bot, msg.video_note.file_id);
          mediaMimeType = 'video/mp4';
        } else {
          // Unsupported message type
          console.log(`[Telegram] Unsupported message type from ${from.id}`);
          return;
        }

        // Capture reply context (incoming message replying to another message)
        let replyToMessageId: string | undefined;
        let replyToContent: string | undefined;
        let replyToSenderName: string | undefined;

        if (msg.reply_to_message) {
          const replyMsg = msg.reply_to_message;
          replyToMessageId = replyMsg.message_id.toString();

          // Get the content of the replied-to message
          if (replyMsg.text) {
            replyToContent = replyMsg.text;
          } else if (replyMsg.caption) {
            replyToContent = replyMsg.caption;
          } else if (replyMsg.photo) {
            replyToContent = '[Photo]';
          } else if (replyMsg.video) {
            replyToContent = '[Video]';
          } else if (replyMsg.audio || replyMsg.voice) {
            replyToContent = '[Audio]';
          } else if (replyMsg.document) {
            replyToContent = '[Document]';
          } else if (replyMsg.sticker) {
            replyToContent = '[Sticker]';
          }

          // Get sender name of replied-to message
          if (replyMsg.from) {
            replyToSenderName = [replyMsg.from.first_name, replyMsg.from.last_name]
              .filter(Boolean)
              .join(' ') || undefined;
          }
        }

        // Build IncomingMessage
        const incomingMessage: IncomingMessage = {
          channelType: 'telegram',
          channelAccountId: accountId,
          channelMessageId: msg.message_id.toString(),
          chatId: chat.id.toString(),
          senderId: from.id.toString(),
          senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined,
          senderProfilePic: undefined, // Would need separate API call
          contentType,
          content,
          mediaUrl,
          mediaMimeType,
          caption,
          timestamp: new Date(msg.date * 1000), // Telegram uses Unix timestamp
          isGroup: chat.type === 'group' || chat.type === 'supergroup',
          groupId: chat.type !== 'private' ? chat.id.toString() : undefined,
          groupName: chat.type !== 'private' ? (chat as any).title : undefined,
          rawMessage: msg,
          // Reply context
          replyToMessageId,
          replyToContent,
          replyToSenderName,
        };

        console.log(`[Telegram] Message from ${from.id} in ${chat.id}: ${contentType}`);

        // Emit to handlers
        await this.emitMessage(incomingMessage);
      } catch (error) {
        console.error('[Telegram] Error processing message:', error);
      }
    });

    // Handle errors
    bot.catch((err) => {
      console.error('[Telegram] Bot error:', err);
      if (err instanceof GrammyError) {
        console.error('[Telegram] GrammyError:', err.description);
      } else if (err instanceof HttpError) {
        console.error('[Telegram] HttpError:', err);
      }
    });
  }

  /**
   * Get direct URL for a file
   */
  private async getFileUrl(bot: Bot, fileId: string): Promise<string | undefined> {
    try {
      const file = await bot.api.getFile(fileId);
      if (file.file_path) {
        // Construct the file URL
        const token = (bot.api as any).token;
        return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      }
    } catch (error) {
      console.error('[Telegram] Failed to get file URL:', error);
    }
    return undefined;
  }

  /**
   * Enforce rate limit: 1 message per second per chat
   */
  private async enforceRateLimit(accountId: string, chatId: string): Promise<void> {
    const key = `${accountId}:${chatId}`;
    const lastTime = this.lastMessageTime.get(key) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    // Telegram allows 1 msg/sec to same chat
    const minDelay = 1100; // 1.1 seconds to be safe

    if (elapsed < minDelay) {
      const waitTime = minDelay - elapsed;
      console.log(`[Telegram] Rate limiting: waiting ${waitTime}ms for chat ${chatId}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastMessageTime.set(key, Date.now());
  }

  /**
   * Enforce global rate limit: 30 messages per second across all chats
   * Uses sliding window algorithm to track message timestamps
   */
  private async enforceGlobalRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    // Remove timestamps older than the window
    this.globalRateLimit.timestamps = this.globalRateLimit.timestamps.filter(
      ts => now - ts < windowMs
    );

    // Check if we've hit the limit
    if (this.globalRateLimit.timestamps.length >= this.globalRateLimit.maxPerSecond) {
      // Calculate how long to wait until the oldest message exits the window
      const oldestTimestamp = this.globalRateLimit.timestamps[0];
      const waitTime = windowMs - (now - oldestTimestamp) + 50; // +50ms buffer

      if (waitTime > 0) {
        console.log(`[Telegram] Global rate limit reached (${this.globalRateLimit.maxPerSecond}/sec), waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Clean up again after waiting
        const nowAfterWait = Date.now();
        this.globalRateLimit.timestamps = this.globalRateLimit.timestamps.filter(
          ts => nowAfterWait - ts < windowMs
        );
      }
    }

    // Record this message timestamp
    this.globalRateLimit.timestamps.push(Date.now());
  }
}

// Export singleton instance
export const telegramAdapter = new TelegramAdapter();
