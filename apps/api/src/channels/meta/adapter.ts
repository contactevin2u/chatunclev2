import crypto from 'crypto';
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
import { BaseChannelAdapter, type MetaAdapter } from '../base.js';

// Token refresh configuration
const TOKEN_REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000; // Refresh 7 days before expiry
const TOKEN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check every 6 hours

// Meta Graph API configuration
const META_API_VERSION = 'v18.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Rate limits for Meta platforms
const META_RATE_LIMITS = {
  MIN_MESSAGE_DELAY_MS: 1000, // 1 second between messages to same recipient
  REQUESTS_PER_HOUR: 200, // Conservative hourly limit
};

// Messaging window limits
const MESSAGING_WINDOW = {
  STANDARD_HOURS: 24, // Standard 24-hour window
  HUMAN_AGENT_DAYS: 7, // Extended window with HUMAN_AGENT tag
};

interface MetaCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  appId?: string;
  instagramAccountId?: string;
  tokenExpiresAt?: string;
  platform: 'instagram' | 'messenger';
}

interface MetaSession {
  accountId: string;
  credentials: MetaCredentials;
  platform: 'instagram' | 'messenger';
  pageName?: string;
  startedAt: Date;
  tokenExpiresAt?: Date;
}

interface MetaRateLimitState {
  timestamps: number[];
  lastRecipientTime: Map<string, number>;
}

interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging?: MetaMessagingEvent[];
}

interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: 'image' | 'video' | 'audio' | 'file' | 'location' | 'fallback';
      payload: {
        url?: string;
        coordinates?: { lat: number; long: number };
      };
    }>;
    reply_to?: { mid: string };
  };
  postback?: {
    payload: string;
    title?: string;
  };
  read?: { watermark: number };
  delivery?: { mids: string[]; watermark: number };
}

/**
 * Meta adapter for Instagram and Messenger
 * Uses Graph API with webhook for real-time messaging
 *
 * Features:
 * - OAuth 2.0 with automatic token refresh
 * - Webhook-based message receiving with signature verification
 * - Rate limiting per recipient (1 sec min delay)
 * - 24-hour messaging window (7 days with HUMAN_AGENT tag)
 */
export class MetaAdapterImpl extends BaseChannelAdapter implements MetaAdapter {
  readonly type: 'instagram' | 'messenger';

  private sessions = new Map<string, MetaSession>();
  private rateLimitState = new Map<string, MetaRateLimitState>();
  private appSecrets = new Map<string, string>();
  private config: ChannelConfig = {};
  private tokenCheckInterval: NodeJS.Timeout | null = null;

  constructor(platform: 'instagram' | 'messenger' = 'messenger') {
    super();
    this.type = platform;
  }

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.startTokenRefreshCheck();
    console.log(`[Meta] ${this.type} adapter initialized`);
  }

  /**
   * Start periodic token refresh check
   */
  private startTokenRefreshCheck(): void {
    if (this.tokenCheckInterval) return;

    this.tokenCheckInterval = setInterval(() => {
      this.checkAndRefreshTokens();
    }, TOKEN_CHECK_INTERVAL_MS);

    console.log(`[Meta] Token refresh check started (every ${TOKEN_CHECK_INTERVAL_MS / 3600000}h)`);
  }

  /**
   * Check all accounts and refresh tokens as needed
   */
  private async checkAndRefreshTokens(): Promise<void> {
    const now = Date.now();

    for (const [accountId, session] of this.sessions) {
      if (!session.tokenExpiresAt) continue;

      const expiresAt = session.tokenExpiresAt.getTime();
      const shouldRefresh = expiresAt - now < TOKEN_REFRESH_BUFFER_MS;

      if (shouldRefresh) {
        console.log(`[Meta] Token for ${accountId} expires soon, attempting refresh...`);
        try {
          await this.refreshToken(accountId);
        } catch (error) {
          console.error(`[Meta] Failed to refresh token for ${accountId}:`, error);
        }
      }
    }
  }

  /**
   * Refresh access token for an account
   */
  async refreshToken(accountId: string): Promise<boolean> {
    const session = this.sessions.get(accountId);
    if (!session) {
      console.error(`[Meta] Cannot refresh token: account ${accountId} not found`);
      return false;
    }

    const creds = session.credentials;
    if (!creds.appId || !creds.appSecret) {
      console.warn(`[Meta] Cannot refresh token: missing appId or appSecret for ${accountId}`);
      return false;
    }

    try {
      const url = new URL(`${META_API_BASE}/oauth/access_token`);
      url.searchParams.set('grant_type', 'fb_exchange_token');
      url.searchParams.set('client_id', creds.appId);
      url.searchParams.set('client_secret', creds.appSecret);
      url.searchParams.set('fb_exchange_token', creds.pageAccessToken);

      const response = await fetch(url.toString());
      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: { message: string };
      };

      if (!response.ok || !data.access_token) {
        throw new Error(data.error?.message || 'Token refresh failed');
      }

      // Update token in memory
      session.credentials.pageAccessToken = data.access_token;
      session.tokenExpiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined;

      // Persist to database
      await this.persistTokenToDatabase(accountId, data.access_token, session.tokenExpiresAt);

      console.log(
        `[Meta] Token refreshed for ${accountId}, expires: ${session.tokenExpiresAt?.toISOString() || 'unknown'}`
      );
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Meta] Token refresh error for ${accountId}:`, message);
      return false;
    }
  }

  /**
   * Persist refreshed token to database
   */
  private async persistTokenToDatabase(
    accountId: string,
    accessToken: string,
    expiresAt?: Date
  ): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { db } = await import('../../db/index.js');
      const { accounts } = await import('../../db/schema.js');
      const { eq } = await import('drizzle-orm');

      await db
        .update(accounts)
        .set({
          credentials: {
            pageAccessToken: accessToken,
            tokenExpiresAt: expiresAt?.toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));
    } catch (error) {
      console.error(`[Meta] Failed to persist token to database:`, error);
    }
  }

  async connect(accountId: string, credentials: unknown): Promise<ConnectionResult> {
    if (this.sessions.has(accountId)) {
      console.log(`[Meta] Session ${accountId} already exists`);
      return { success: true, status: 'connected' };
    }

    const creds = credentials as MetaCredentials;
    if (!creds?.pageAccessToken || !creds?.pageId) {
      return { success: false, error: 'Page access token and page ID are required' };
    }

    if (!creds?.appSecret) {
      return { success: false, error: 'App secret is required for webhook verification' };
    }

    if (this.type === 'instagram' && !creds?.instagramAccountId) {
      return { success: false, error: 'Instagram account ID is required for Instagram messaging' };
    }

    try {
      console.log(`[Meta] Connecting ${this.type} account ${accountId} (Page: ${creds.pageId})`);
      this.emitConnection(accountId, 'connected');

      // Store app secret for webhook verification
      this.appSecrets.set(accountId, creds.appSecret);

      // Validate token by fetching page info
      const pageInfo = await this.validatePageToken(creds.pageAccessToken, creds.pageId);

      const session: MetaSession = {
        accountId,
        credentials: creds,
        platform: creds.platform || this.type,
        pageName: pageInfo.name,
        startedAt: new Date(),
        tokenExpiresAt: creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : undefined,
      };

      this.sessions.set(accountId, session);

      // Check if token expires soon and refresh
      if (session.tokenExpiresAt) {
        const daysUntilExpiry = Math.floor(
          (session.tokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        console.log(`[Meta] Token expires in ${daysUntilExpiry} days`);
        if (daysUntilExpiry < 7) {
          this.refreshToken(accountId).catch(() => {});
        }
      }

      // Initialize rate limit state
      this.rateLimitState.set(accountId, {
        timestamps: [],
        lastRecipientTime: new Map(),
      });

      this.emitConnection(accountId, 'connected');
      this.emitStatus({
        accountId,
        status: 'connected',
        lastConnectedAt: new Date(),
      });

      console.log(`[Meta] Connected: ${pageInfo.name} (${this.type})`);
      return { success: true, status: 'connected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Meta] Failed to connect ${accountId}:`, error);
      this.emitConnection(accountId, 'error', message);
      return { success: false, error: message };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    console.log(`[Meta] Disconnecting ${session.platform} account ${accountId}`);

    this.sessions.delete(accountId);
    this.rateLimitState.delete(accountId);
    this.appSecrets.delete(accountId);
    this.emitConnection(accountId, 'disconnected');
  }

  async shutdown(): Promise<void> {
    console.log('[Meta] Shutting down all sessions...');

    // Stop token refresh check
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
      this.tokenCheckInterval = null;
    }

    for (const accountId of this.sessions.keys()) {
      await this.disconnect(accountId);
    }

    console.log('[Meta] All sessions shut down');
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const session = this.sessions.get(params.accountId);
    if (!session) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    try {
      // Apply rate limiting
      await this.enforceRateLimit(params.accountId, params.recipientId);

      const messagePayload = this.buildMessagePayload(
        params.recipientId,
        params.contentType,
        params.content,
        params.mediaUrl
      );

      // Send via Graph API with auto-retry on 401
      const result = await this.graphApiRequest(
        session.credentials.pageAccessToken,
        'POST',
        this.getMessagesEndpoint(session),
        messagePayload,
        params.accountId
      );

      if (result.message_id) {
        console.log(`[Meta] ${session.platform} message sent: ${result.message_id}`);
        return {
          success: true,
          messageId: result.message_id,
          timestamp: new Date(),
        };
      } else {
        throw new Error(result.error?.message || 'Failed to send message');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Meta] Send message error:`, error);
      return { success: false, error: message, retryable: true };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    return this.sendMessage({
      ...params,
      content: params.mediaUrl,
    });
  }

  async sendQuickReplies(
    accountId: string,
    recipientId: string,
    text: string,
    replies: Array<{ title: string; payload: string }>
  ): Promise<SendResult> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    try {
      await this.enforceRateLimit(accountId, recipientId);

      const messageData = {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          text,
          quick_replies: replies.map((r) => ({
            content_type: 'text',
            title: r.title,
            payload: r.payload,
          })),
        },
      };

      const result = await this.graphApiRequest(
        session.credentials.pageAccessToken,
        'POST',
        this.getMessagesEndpoint(session),
        messageData,
        accountId
      );

      return {
        success: true,
        messageId: result.message_id,
        timestamp: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message, retryable: true };
    }
  }

  async sendGenericTemplate(
    accountId: string,
    recipientId: string,
    elements: Array<{
      title: string;
      subtitle?: string;
      image_url?: string;
      buttons?: Array<{ type: string; title: string; payload?: string; url?: string }>;
    }>
  ): Promise<SendResult> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    try {
      await this.enforceRateLimit(accountId, recipientId);

      const messageData = {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: elements.map((el) => ({
                title: el.title,
                subtitle: el.subtitle,
                image_url: el.image_url,
                buttons: el.buttons?.map((btn) => {
                  if (btn.url) {
                    return { type: 'web_url', title: btn.title, url: btn.url };
                  }
                  return { type: 'postback', title: btn.title, payload: btn.payload };
                }),
              })),
            },
          },
        },
      };

      const result = await this.graphApiRequest(
        session.credentials.pageAccessToken,
        'POST',
        this.getMessagesEndpoint(session),
        messageData,
        accountId
      );

      return {
        success: true,
        messageId: result.message_id,
        timestamp: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message, retryable: true };
    }
  }

  /**
   * Handle incoming webhook event
   */
  handleWebhook(accountId: string, event: unknown): void {
    const session = this.sessions.get(accountId);
    if (!session) {
      console.warn(`[Meta] Received webhook for unknown account: ${accountId}`);
      return;
    }

    const body = event as { entry?: MetaWebhookEntry[] };
    if (!body.entry) return;

    for (const entry of body.entry) {
      if (!entry.messaging) continue;

      for (const messagingEvent of entry.messaging) {
        this.processMessagingEvent(accountId, session, messagingEvent);
      }
    }
  }

  /**
   * Process webhook with signature verification
   */
  async processWebhook(accountId: string, signature: string, body: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      console.error(`[Meta] Webhook received for unknown account: ${accountId}`);
      return;
    }

    // Verify webhook signature
    if (!this.verifyWebhookSignature(accountId, signature, body)) {
      console.error(`[Meta] Invalid webhook signature for account ${accountId}`);
      return;
    }

    let payload: { object?: string; entry?: MetaWebhookEntry[] };
    try {
      payload = JSON.parse(body);
    } catch {
      console.error(`[Meta] Invalid JSON in webhook body`);
      return;
    }

    console.log(`[Meta] Webhook received: ${payload.object}`);

    if (payload.object === 'instagram' || payload.object === 'page') {
      for (const entry of payload.entry || []) {
        if (!entry.messaging) continue;
        for (const messagingEvent of entry.messaging) {
          await this.processMessagingEvent(accountId, session, messagingEvent);
        }
      }
    }
  }

  /**
   * Verify webhook signature using constant-time comparison
   */
  verifyWebhookSignature(accountId: string, signature: string, body: string): boolean {
    const appSecret = this.appSecrets.get(accountId);
    if (!appSecret) {
      console.warn(`[Meta] No app secret found for account ${accountId}`);
      return false;
    }

    // Security: Reject missing signatures in production
    if (!signature) {
      console.warn(`[Meta] No signature in webhook - rejecting for security`);
      return process.env.NODE_ENV === 'development';
    }

    // Meta signature format: sha256=SIGNATURE
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      console.warn(`[Meta] Signature length mismatch`);
      return false;
    }

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );

      if (!isValid) {
        console.warn(`[Meta] Signature mismatch`);
      }

      return isValid;
    } catch {
      console.error(`[Meta] Signature verification error`);
      return false;
    }
  }

  /**
   * Verify webhook challenge for initial setup
   */
  verifyWebhookChallenge(
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log(`[Meta] Webhook verified`);
      return challenge;
    }
    console.warn(`[Meta] Webhook verification failed`);
    return null;
  }

  /**
   * Get contact profile
   */
  async getContactProfile(
    accountId: string,
    contactId: string
  ): Promise<{ displayName?: string; username?: string; profilePicUrl?: string } | null> {
    const session = this.sessions.get(accountId);
    if (!session) return null;

    try {
      const fields =
        session.platform === 'instagram'
          ? 'id,username,name,profile_pic'
          : 'id,first_name,last_name,profile_pic';

      const response = await this.graphApiRequest(
        session.credentials.pageAccessToken,
        'GET',
        contactId,
        { fields },
        accountId
      );

      return {
        displayName:
          session.platform === 'instagram'
            ? response.name || response.username
            : `${response.first_name || ''} ${response.last_name || ''}`.trim(),
        username: response.username,
        profilePicUrl: response.profile_pic,
      };
    } catch {
      return null;
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

  // === PRIVATE METHODS ===

  /**
   * Validate page access token
   */
  private async validatePageToken(
    accessToken: string,
    pageId: string
  ): Promise<{ name: string; id: string }> {
    const response = await this.graphApiRequest(accessToken, 'GET', pageId, { fields: 'id,name' });

    if (!response.id) {
      throw new Error('Invalid page access token or page ID');
    }

    return response;
  }

  /**
   * Make Graph API request with automatic token refresh on 401
   */
  private async graphApiRequest(
    accessToken: string,
    method: 'GET' | 'POST',
    endpoint: string,
    params?: Record<string, unknown>,
    accountId?: string,
    retryCount: number = 0
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${META_API_BASE}/${endpoint}`);
    url.searchParams.set('access_token', accessToken);

    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    } else if (method === 'POST' && params) {
      fetchOptions.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const error = data.error as { code?: number; error_subcode?: number; message?: string };
      const errorCode = error?.code;
      const errorSubcode = error?.error_subcode;

      // Check for token expiration (190 = invalid token, 463 = expired)
      const isTokenError = errorCode === 190 || response.status === 401 || errorSubcode === 463;

      // Attempt token refresh on token errors (only once)
      if (isTokenError && accountId && retryCount === 0) {
        console.log(`[Meta] Token error detected, attempting refresh for ${accountId}...`);

        const refreshed = await this.refreshToken(accountId);
        if (refreshed) {
          const session = this.sessions.get(accountId);
          if (session) {
            console.log(`[Meta] Retrying request with new token...`);
            return this.graphApiRequest(
              session.credentials.pageAccessToken,
              method,
              endpoint,
              params,
              accountId,
              retryCount + 1
            );
          }
        }
      }

      throw new Error(error?.message || `API request failed (${response.status})`);
    }

    return data;
  }

  /**
   * Get messages endpoint based on platform
   */
  private getMessagesEndpoint(session: MetaSession): string {
    if (session.platform === 'instagram') {
      if (!session.credentials.instagramAccountId) {
        throw new Error('Instagram account ID not configured');
      }
      return `${session.credentials.instagramAccountId}/messages`;
    }
    return `${session.credentials.pageId}/messages`;
  }

  /**
   * Build message payload for sending
   */
  private buildMessagePayload(
    recipientId: string,
    contentType: ContentType,
    content?: string,
    mediaUrl?: string,
    useHumanAgentTag?: boolean
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      recipient: { id: recipientId },
      messaging_type: useHumanAgentTag ? 'MESSAGE_TAG' : 'RESPONSE',
    };

    if (useHumanAgentTag) {
      payload.tag = 'HUMAN_AGENT';
    }

    switch (contentType) {
      case 'text':
        payload.message = { text: content };
        break;
      case 'image':
        payload.message = {
          attachment: { type: 'image', payload: { url: mediaUrl, is_reusable: true } },
        };
        break;
      case 'video':
        payload.message = {
          attachment: { type: 'video', payload: { url: mediaUrl, is_reusable: true } },
        };
        break;
      case 'audio':
        payload.message = {
          attachment: { type: 'audio', payload: { url: mediaUrl, is_reusable: true } },
        };
        break;
      case 'document':
        payload.message = {
          attachment: { type: 'file', payload: { url: mediaUrl, is_reusable: true } },
        };
        break;
      default:
        payload.message = { text: content || '[Unsupported message type]' };
    }

    return payload;
  }

  /**
   * Process incoming messaging event
   */
  private async processMessagingEvent(
    accountId: string,
    session: MetaSession,
    event: MetaMessagingEvent
  ): Promise<void> {
    // Skip if sender is the page itself
    if (
      event.sender.id === session.credentials.pageId ||
      event.sender.id === session.credentials.instagramAccountId
    ) {
      return;
    }

    // Skip delivery/read receipts
    if (event.delivery || event.read) return;

    if (event.message) {
      await this.handleIncomingMessage(accountId, session, event);
    } else if (event.postback) {
      await this.handlePostback(accountId, session, event);
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(
    accountId: string,
    session: MetaSession,
    event: MetaMessagingEvent
  ): Promise<void> {
    const msg = event.message!;

    let contentType: ContentType = 'text';
    let content: string | undefined;
    let mediaUrl: string | undefined;

    if (msg.text) {
      contentType = 'text';
      content = msg.text;
    } else if (msg.attachments && msg.attachments.length > 0) {
      const attachment = msg.attachments[0];
      switch (attachment.type) {
        case 'image':
          contentType = 'image';
          mediaUrl = attachment.payload.url;
          break;
        case 'video':
          contentType = 'video';
          mediaUrl = attachment.payload.url;
          break;
        case 'audio':
          contentType = 'audio';
          mediaUrl = attachment.payload.url;
          break;
        case 'file':
          contentType = 'document';
          mediaUrl = attachment.payload.url;
          break;
        case 'location':
          contentType = 'location';
          content = JSON.stringify(attachment.payload.coordinates);
          break;
        default:
          contentType = 'text';
          content = '[Attachment]';
      }
    }

    // Handle timestamp (milliseconds vs seconds)
    let messageTimestamp: Date;
    if (event.timestamp) {
      const ts = event.timestamp;
      messageTimestamp = new Date(ts < 10000000000 ? ts * 1000 : ts);
    } else {
      messageTimestamp = new Date();
    }

    const incomingMessage: IncomingMessage = {
      channelType: session.platform,
      channelAccountId: accountId,
      channelMessageId: msg.mid,
      chatId: event.sender.id,
      isGroup: false,
      senderId: event.sender.id,
      senderName: undefined,
      contentType,
      content,
      mediaUrl,
      replyToMessageId: msg.reply_to?.mid,
      timestamp: messageTimestamp,
      isFromMe: false,
      rawMessage: event,
    };

    console.log(`[Meta] ${session.platform} message from ${event.sender.id}: ${contentType}`);
    await this.emitMessage(incomingMessage);
  }

  /**
   * Handle postback (button click)
   */
  private async handlePostback(
    accountId: string,
    session: MetaSession,
    event: MetaMessagingEvent
  ): Promise<void> {
    const postback = event.postback!;

    const incomingMessage: IncomingMessage = {
      channelType: session.platform,
      channelAccountId: accountId,
      channelMessageId: `postback_${event.timestamp}`,
      chatId: event.sender.id,
      isGroup: false,
      senderId: event.sender.id,
      contentType: 'text',
      content: postback.title || postback.payload,
      timestamp: new Date(event.timestamp),
      isFromMe: false,
      rawMessage: event,
    };

    await this.emitMessage(incomingMessage);
  }

  /**
   * Enforce rate limiting per recipient
   */
  private async enforceRateLimit(accountId: string, recipientId: string): Promise<void> {
    let state = this.rateLimitState.get(accountId);
    if (!state) {
      state = { timestamps: [], lastRecipientTime: new Map() };
      this.rateLimitState.set(accountId, state);
    }

    const now = Date.now();

    // Check per-recipient rate limit
    const lastTime = state.lastRecipientTime.get(recipientId) || 0;
    const elapsed = now - lastTime;

    if (elapsed < META_RATE_LIMITS.MIN_MESSAGE_DELAY_MS) {
      const waitTime = META_RATE_LIMITS.MIN_MESSAGE_DELAY_MS - elapsed;
      console.log(`[Meta] Rate limit: waiting ${waitTime}ms for recipient ${recipientId}`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Record this request
    const recordTime = Date.now();
    state.timestamps.push(recordTime);
    state.lastRecipientTime.set(recipientId, recordTime);

    // Clean old timestamps (older than 1 hour)
    const oneHourAgo = recordTime - 3600000;
    state.timestamps = state.timestamps.filter((ts) => ts > oneHourAgo);
  }
}
