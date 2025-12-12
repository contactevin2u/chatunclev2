/**
 * Telegram Adapter
 * Uses grammY library for Telegram Bot API
 *
 * Key features:
 * - Official API with bot tokens (no reverse engineering)
 * - Very low ban risk (just respect rate limits)
 * - Long polling or webhooks for updates
 * - Proper rate limiting (30 msg/sec global, 1 msg/sec per chat)
 * - File URL resolution for media
 * - Reply context extraction
 *
 * Rate Limits:
 * - 30 messages/second total (distributed across chats)
 * - 1 message/second to same chat (we add 1100ms delay)
 * - 20 messages/minute to groups
 */

import { Bot, Context, webhookCallback, InlineKeyboard, GrammyError, HttpError } from 'grammy';
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
import {
  BaseChannelAdapter,
  type TelegramAdapter,
} from '../base.js';

interface TelegramCredentials {
  botToken: string;
  webhookUrl?: string;
  useWebhook?: boolean;
}

interface BotSession {
  bot: Bot;
  botToken: string;
  botInfo: { id: number; username: string; firstName: string };
  isPolling: boolean;
  startedAt: Date;
}

// Rate limit configuration
const TELEGRAM_RATE_LIMITS = {
  GLOBAL_MAX_PER_SECOND: 30, // 30 messages per second across all chats
  PER_CHAT_DELAY_MS: 1100,   // 1.1 seconds between messages to same chat
};

// Global rate limiter state (shared across all bot instances)
interface GlobalRateLimitState {
  timestamps: number[]; // Rolling window of message timestamps
  maxPerSecond: number;
}

/**
 * Contact profile from Telegram
 */
interface TelegramContactProfile {
  channelUserId: string;
  displayName?: string;
  username?: string;
  profilePicUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Telegram adapter implementation using grammY
 * Supports both webhook and long-polling modes
 * Includes proper rate limiting, file URL resolution, and error handling
 */
export class TelegramAdapterImpl extends BaseChannelAdapter implements TelegramAdapter {
  readonly type = 'telegram' as const;

  private sessions = new Map<string, BotSession>();
  private config: ChannelConfig = {};

  // Rate limiting state
  private lastMessageTime = new Map<string, number>(); // accountId:chatId -> timestamp
  private globalRateLimit: GlobalRateLimitState = {
    timestamps: [],
    maxPerSecond: TELEGRAM_RATE_LIMITS.GLOBAL_MAX_PER_SECOND,
  };

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    console.log('[Telegram] Adapter initialized with rate limiting');
  }

  async connect(accountId: string, credentials: unknown): Promise<ConnectionResult> {
    // Check if already connected
    if (this.sessions.has(accountId)) {
      console.log(`[Telegram] Bot ${accountId} already connected, disconnecting first...`);
      await this.disconnect(accountId);
    }

    const creds = credentials as TelegramCredentials;
    if (!creds?.botToken) {
      return { success: false, error: 'Bot token is required' };
    }

    try {
      console.log(`[Telegram] Connecting bot ${accountId}...`);

      const bot = new Bot(creds.botToken);

      // Get bot info to validate token
      const botInfo = await bot.api.getMe();
      console.log(`[Telegram] Bot connected: @${botInfo.username} (${botInfo.first_name})`);

      // Set up message handlers
      this.setupHandlers(accountId, bot, creds.botToken);

      // Start bot (webhook or polling)
      if (creds.useWebhook && creds.webhookUrl) {
        await bot.api.setWebhook(creds.webhookUrl);
        console.log(`[Telegram] Webhook set: ${creds.webhookUrl}`);
      } else {
        // Use long polling (non-blocking)
        bot.start({
          onStart: () => {
            console.log(`[Telegram] Bot ${accountId} started polling`);
          },
        });
      }

      this.sessions.set(accountId, {
        bot,
        botToken: creds.botToken,
        botInfo: {
          id: botInfo.id,
          username: botInfo.username || '',
          firstName: botInfo.first_name,
        },
        isPolling: !creds.useWebhook,
        startedAt: new Date(),
      });

      this.emitConnection(accountId, 'connected');
      this.emitStatus({
        accountId,
        status: 'connected',
        lastConnectedAt: new Date(),
      });

      return { success: true, status: 'connected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Telegram] Failed to connect bot ${accountId}:`, error);

      // Provide descriptive error for common issues
      if (error instanceof GrammyError) {
        if (error.error_code === 401) {
          return { success: false, error: 'Invalid bot token. Check your token from @BotFather' };
        }
      }

      return { success: false, error: message };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    console.log(`[Telegram] Disconnecting bot ${accountId}...`);

    const session = this.sessions.get(accountId);
    if (session) {
      try {
        if (session.isPolling) {
          await session.bot.stop();
        } else {
          await session.bot.api.deleteWebhook();
        }
      } catch (error) {
        console.error(`[Telegram] Error disconnecting:`, error);
      }
    }

    // Clean up rate limit state for this account
    for (const key of this.lastMessageTime.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        this.lastMessageTime.delete(key);
      }
    }

    this.sessions.delete(accountId);
    this.emitConnection(accountId, 'disconnected');
    console.log(`[Telegram] Bot ${accountId} disconnected`);
  }

  async shutdown(): Promise<void> {
    console.log('[Telegram] Shutting down all bots...');

    const promises = Array.from(this.sessions.keys()).map((accountId) =>
      this.disconnect(accountId)
    );

    await Promise.all(promises);
    this.lastMessageTime.clear();
    this.globalRateLimit.timestamps = [];
    console.log('[Telegram] All bots shut down');
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const session = this.sessions.get(params.accountId);
    if (!session) {
      return { success: false, error: 'Bot not connected', retryable: true };
    }

    const chatId = params.recipientId;

    try {
      // Apply rate limiting before sending
      await this.enforceGlobalRateLimit();
      await this.enforcePerChatRateLimit(params.accountId, chatId);

      if (params.contentType === 'text') {
        const result = await session.bot.api.sendMessage(
          chatId,
          params.content || '',
          {
            reply_to_message_id: params.replyToMessageId
              ? parseInt(params.replyToMessageId)
              : undefined,
            parse_mode: 'HTML',
          }
        );

        console.log(`[Telegram] Message sent to ${chatId}: ${result.message_id}`);

        return {
          success: true,
          messageId: result.message_id.toString(),
          timestamp: new Date(),
        };
      } else if (params.contentType === 'location') {
        const [lat, lng] = (params.content || '0,0').split(',').map(Number);
        const result = await session.bot.api.sendLocation(
          chatId,
          lat,
          lng,
          {
            reply_to_message_id: params.replyToMessageId
              ? parseInt(params.replyToMessageId)
              : undefined,
          }
        );

        return {
          success: true,
          messageId: result.message_id.toString(),
          timestamp: new Date(),
        };
      }

      // For media, use sendMedia
      return this.sendMedia(params as SendMediaParams);
    } catch (error) {
      return this.handleSendError(error, chatId);
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    const session = this.sessions.get(params.accountId);
    if (!session) {
      return { success: false, error: 'Bot not connected', retryable: true };
    }

    const chatId = params.recipientId;

    try {
      // Apply rate limiting before sending
      await this.enforceGlobalRateLimit();
      await this.enforcePerChatRateLimit(params.accountId, chatId);

      const replyOptions = {
        reply_to_message_id: params.replyToMessageId
          ? parseInt(params.replyToMessageId)
          : undefined,
        caption: params.caption || params.content,
        parse_mode: 'HTML' as const,
      };

      let result;

      switch (params.contentType) {
        case 'image':
          result = await session.bot.api.sendPhoto(
            chatId,
            params.mediaUrl,
            replyOptions
          );
          break;

        case 'video':
          result = await session.bot.api.sendVideo(
            chatId,
            params.mediaUrl,
            replyOptions
          );
          break;

        case 'audio':
          result = await session.bot.api.sendAudio(
            chatId,
            params.mediaUrl,
            replyOptions
          );
          break;

        case 'document':
          result = await session.bot.api.sendDocument(
            chatId,
            params.mediaUrl,
            replyOptions
          );
          break;

        case 'sticker':
          result = await session.bot.api.sendSticker(
            chatId,
            params.mediaUrl,
            { reply_to_message_id: replyOptions.reply_to_message_id }
          );
          break;

        default:
          return { success: false, error: `Unsupported media type: ${params.contentType}` };
      }

      console.log(`[Telegram] Media sent to ${chatId}: ${result.message_id}`);

      return {
        success: true,
        messageId: result.message_id.toString(),
        timestamp: new Date(),
      };
    } catch (error) {
      return this.handleSendError(error, chatId);
    }
  }

  async sendInlineKeyboard(
    accountId: string,
    chatId: string,
    text: string,
    keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  ): Promise<SendResult> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return { success: false, error: 'Bot not connected', retryable: true };
    }

    try {
      // Apply rate limiting
      await this.enforceGlobalRateLimit();
      await this.enforcePerChatRateLimit(accountId, chatId);

      const inlineKeyboard = new InlineKeyboard();

      for (const row of keyboard) {
        for (const button of row) {
          if (button.url) {
            inlineKeyboard.url(button.text, button.url);
          } else if (button.callback_data) {
            inlineKeyboard.text(button.text, button.callback_data);
          }
        }
        inlineKeyboard.row();
      }

      const result = await session.bot.api.sendMessage(chatId, text, {
        reply_markup: inlineKeyboard,
        parse_mode: 'HTML',
      });

      return {
        success: true,
        messageId: result.message_id.toString(),
        timestamp: new Date(),
      };
    } catch (error) {
      return this.handleSendError(error, chatId);
    }
  }

  async answerCallbackQuery(accountId: string, queryId: string, text?: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    try {
      await session.bot.api.answerCallbackQuery(queryId, { text });
    } catch (error) {
      console.error(`[Telegram] Answer callback error:`, error);
    }
  }

  /**
   * Get contact profile from Telegram using getChat API
   */
  async getContactProfile(accountId: string, contactId: string): Promise<TelegramContactProfile | null> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return null;
    }

    try {
      const chat = await session.bot.api.getChat(contactId);

      // Handle different chat types
      if (chat.type === 'private') {
        const user = chat as any;
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
   * Get user profile photos
   */
  async getUserProfilePhotos(accountId: string, userId: string, limit: number = 1): Promise<string[]> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return [];
    }

    try {
      const photos = await session.bot.api.getUserProfilePhotos(parseInt(userId, 10), { limit });

      if (photos.total_count === 0) {
        return [];
      }

      const photoUrls: string[] = [];
      for (const photoSizes of photos.photos) {
        // Get the largest size (last in array)
        const largestPhoto = photoSizes[photoSizes.length - 1];
        const url = await this.getFileUrl(session.bot, session.botToken, largestPhoto.file_id);
        if (url) {
          photoUrls.push(url);
        }
      }

      return photoUrls;
    } catch (error) {
      console.error(`[Telegram] Failed to get profile photos for ${userId}:`, error);
      return [];
    }
  }

  getStatus(accountId: string): ConnectionStatus {
    const session = this.sessions.get(accountId);
    return {
      accountId,
      status: session ? 'connected' : 'disconnected',
    };
  }

  isConnected(accountId: string): boolean {
    return this.sessions.has(accountId);
  }

  getActiveAccounts(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get bot info for an account
   */
  getBotInfo(accountId: string): { id: number; username: string; firstName: string } | null {
    const session = this.sessions.get(accountId);
    return session?.botInfo || null;
  }

  /**
   * Get webhook handler for Express/Hono integration
   */
  getWebhookHandler(accountId: string): ((req: any, res: any) => void) | null {
    const session = this.sessions.get(accountId);
    if (!session) return null;

    return webhookCallback(session.bot, 'express');
  }

  // === PRIVATE METHODS ===

  /**
   * Handle send errors with specific error messages
   */
  private handleSendError(error: unknown, chatId: string): SendResult {
    console.error(`[Telegram] Send error to ${chatId}:`, error);

    if (error instanceof GrammyError) {
      // Handle specific Telegram errors
      switch (error.error_code) {
        case 400:
          return { success: false, error: `Bad request: ${error.description}`, retryable: false };
        case 403:
          return { success: false, error: 'Bot was blocked by user or kicked from group', retryable: false };
        case 404:
          return { success: false, error: 'Chat not found', retryable: false };
        case 429:
          // Rate limited - should retry after waiting
          const retryAfter = (error as any).parameters?.retry_after || 30;
          return {
            success: false,
            error: `Rate limited. Retry after ${retryAfter} seconds`,
            retryable: true,
          };
        default:
          return { success: false, error: error.description, retryable: true };
      }
    }

    if (error instanceof HttpError) {
      return { success: false, error: `Network error: ${error.message}`, retryable: true };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message, retryable: true };
  }

  private setupHandlers(accountId: string, bot: Bot, botToken: string): void {
    // Handle all messages
    bot.on('message', async (ctx: Context) => {
      try {
        const incoming = await this.transformMessage(accountId, ctx, botToken);
        if (incoming) {
          await this.emitMessage(incoming);
        }
      } catch (error) {
        console.error('[Telegram] Error processing message:', error);
      }
    });

    // Callback queries (button presses)
    bot.on('callback_query:data', async (ctx) => {
      console.log(`[Telegram] Callback query: ${ctx.callbackQuery.data}`);
      // Could emit this as a special message type if needed
    });

    // Error handler
    bot.catch((err) => {
      console.error(`[Telegram] Bot error for ${accountId}:`, err);
      if (err instanceof GrammyError) {
        console.error('[Telegram] GrammyError:', err.description);
      } else if (err instanceof HttpError) {
        console.error('[Telegram] HttpError:', err.message);
      }
    });
  }

  /**
   * Transform Telegram message to IncomingMessage format
   * Includes file URL resolution and reply context extraction
   */
  private async transformMessage(
    accountId: string,
    ctx: Context,
    botToken: string
  ): Promise<IncomingMessage | null> {
    const msg = ctx.message;
    if (!msg) return null;

    const chat = msg.chat;
    const from = msg.from;
    if (!from) return null;

    // Determine message type and content
    let contentType: ContentType = 'text';
    let content: string | undefined;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let caption: string | undefined;
    let fileName: string | undefined;

    const bot = ctx.api as unknown as Bot['api'];

    if (msg.text) {
      contentType = 'text';
      content = msg.text;
    } else if (msg.photo) {
      contentType = 'image';
      // Get the largest photo (last in array)
      const photo = msg.photo[msg.photo.length - 1];
      mediaUrl = await this.getFileUrl(ctx.api, botToken, photo.file_id);
      caption = msg.caption;
    } else if (msg.video) {
      contentType = 'video';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.video.file_id);
      mediaMimeType = msg.video.mime_type;
      fileName = msg.video.file_name;
      caption = msg.caption;
    } else if (msg.audio) {
      contentType = 'audio';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.audio.file_id);
      mediaMimeType = msg.audio.mime_type;
      fileName = msg.audio.file_name;
      caption = msg.caption;
    } else if (msg.voice) {
      // Voice messages (audio notes)
      contentType = 'audio';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.voice.file_id);
      mediaMimeType = msg.voice.mime_type || 'audio/ogg';
    } else if (msg.video_note) {
      // Video notes (circular videos)
      contentType = 'video';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.video_note.file_id);
      mediaMimeType = 'video/mp4';
    } else if (msg.document) {
      contentType = 'document';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.document.file_id);
      mediaMimeType = msg.document.mime_type;
      fileName = msg.document.file_name;
      caption = msg.caption;
    } else if (msg.location) {
      contentType = 'location';
      content = `${msg.location.latitude},${msg.location.longitude}`;
    } else if (msg.sticker) {
      contentType = 'sticker';
      mediaUrl = await this.getFileUrl(ctx.api, botToken, msg.sticker.file_id);
    } else {
      // Unsupported message type
      console.log(`[Telegram] Unsupported message type from ${from.id}`);
      return null;
    }

    // Extract reply context (incoming message replying to another message)
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
      } else if (replyMsg.location) {
        replyToContent = '[Location]';
      }

      // Get sender name of replied-to message
      if (replyMsg.from) {
        replyToSenderName = [replyMsg.from.first_name, replyMsg.from.last_name]
          .filter(Boolean)
          .join(' ') || replyMsg.from.username || undefined;
      }
    }

    const isGroup = chat.type === 'group' || chat.type === 'supergroup';

    console.log(`[Telegram] Message from ${from.id} in ${chat.id}: ${contentType}`);

    return {
      channelType: 'telegram',
      channelAccountId: accountId,
      channelMessageId: msg.message_id.toString(),
      chatId: chat.id.toString(),
      isGroup,
      groupId: isGroup ? chat.id.toString() : undefined,
      groupName: isGroup ? (chat as any).title : undefined,
      senderId: from.id.toString(),
      senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username,
      contentType,
      content: content || caption,
      mediaUrl,
      mediaMimeType,
      mediaFileName: fileName,
      replyToMessageId,
      replyToContent,
      replyToSenderName,
      timestamp: new Date(msg.date * 1000), // Telegram uses Unix timestamp
      isFromMe: false,
      rawMessage: msg,
    };
  }

  /**
   * Get direct URL for a file (resolves file_id to actual URL)
   */
  private async getFileUrl(api: any, botToken: string, fileId: string): Promise<string | undefined> {
    try {
      const file = await api.getFile(fileId);
      if (file.file_path) {
        // Construct the file URL
        return `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      }
    } catch (error) {
      console.error('[Telegram] Failed to get file URL:', error);
    }
    return undefined;
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

  /**
   * Enforce per-chat rate limit: 1 message per second per chat
   * Telegram limits to 1 msg/sec to same chat, we use 1.1 sec to be safe
   */
  private async enforcePerChatRateLimit(accountId: string, chatId: string): Promise<void> {
    const key = `${accountId}:${chatId}`;
    const lastTime = this.lastMessageTime.get(key) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    const minDelay = TELEGRAM_RATE_LIMITS.PER_CHAT_DELAY_MS;

    if (elapsed < minDelay) {
      const waitTime = minDelay - elapsed;
      console.log(`[Telegram] Per-chat rate limit: waiting ${waitTime}ms for chat ${chatId}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastMessageTime.set(key, Date.now());
  }
}
