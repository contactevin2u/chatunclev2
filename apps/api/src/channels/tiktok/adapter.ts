import crypto from 'crypto';
import type {
  ChannelConfig,
  ConnectionResult,
  ConnectionStatus,
  SendMessageParams,
  SendMediaParams,
  SendResult,
  IncomingMessage,
} from '@chatuncle/shared';
import { BaseChannelAdapter, type TikTokAdapter } from '../base.js';

// TikTok Shop API configuration
const TIKTOK_API_BASE = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_BASE = 'https://auth.tiktok-shops.com';

// Rate limits for TikTok Shop API
const TIKTOK_RATE_LIMITS = {
  REQUESTS_PER_SECOND: 50, // 50 requests per second per store
  MIN_CONVERSATION_DELAY_MS: 1000, // 1 second between messages to same conversation
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 32000,
  MAX_RETRIES: 5,
};

// Polling configuration
const POLL_INTERVAL_MS = 5000; // 5 seconds

interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  shopId: string;
  shopCipher: string;
  tokenExpiresAt?: number;
}

interface TikTokSession {
  accountId: string;
  credentials: TikTokCredentials;
  startedAt: Date;
  pollingInterval?: NodeJS.Timeout;
  lastPollTime: number;
}

interface TikTokConversation {
  conversation_id: string;
  buyer_user_id: string;
  last_message_time: number;
  unread_count: number;
}

interface TikTokMessage {
  message_id: string;
  conversation_id: string;
  sender_type: 'BUYER' | 'SELLER';
  message_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'PRODUCT_CARD';
  content: {
    text?: string;
    image_url?: string;
    video_url?: string;
    product_id?: string;
  };
  create_time: number;
}

interface TikTokRateLimitState {
  timestamps: number[];
  lastConversationTime: Map<string, number>;
}

/**
 * TikTok Shop adapter implementation
 * Uses TikTok Shop Customer Service API for seller messaging
 *
 * Features:
 * - OAuth 2.0 with automatic token refresh
 * - Polling-based message retrieval
 * - Rate limiting (50 req/sec per shop)
 * - Webhook signature verification
 */
export class TikTokAdapterImpl extends BaseChannelAdapter implements TikTokAdapter {
  readonly type = 'tiktok' as const;

  private sessions = new Map<string, TikTokSession>();
  private rateLimitState = new Map<string, TikTokRateLimitState>();
  private appSecrets = new Map<string, string>();
  private config: ChannelConfig = {};

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    console.log('[TikTok] Adapter initialized');
  }

  async connect(accountId: string, credentials: unknown): Promise<ConnectionResult> {
    const creds = credentials as TikTokCredentials;

    if (!creds?.appKey || !creds?.appSecret) {
      return { success: false, error: 'TikTok Shop appKey and appSecret are required' };
    }

    if (!creds?.accessToken || !creds?.refreshToken) {
      return {
        success: false,
        error: 'TikTok Shop accessToken and refreshToken are required. Complete OAuth flow first.',
      };
    }

    if (!creds?.shopId || !creds?.shopCipher) {
      return { success: false, error: 'TikTok Shop shopId and shopCipher are required' };
    }

    if (this.sessions.has(accountId)) {
      console.log(`[TikTok] Session ${accountId} already exists`);
      return { success: true, status: 'connected' };
    }

    console.log(`[TikTok] Connecting shop ${creds.shopId} for account ${accountId}`);

    try {
      this.emitConnection(accountId, 'connected');

      // Store app secret for webhook verification
      this.appSecrets.set(accountId, creds.appSecret);

      // Create session
      const session: TikTokSession = {
        accountId,
        credentials: { ...creds },
        startedAt: new Date(),
        lastPollTime: Date.now(),
      };

      this.sessions.set(accountId, session);

      // Refresh token if expired or expiring soon
      if (Date.now() >= (creds.tokenExpiresAt || 0) - 60000) {
        console.log(`[TikTok] Token expired or expiring soon, refreshing...`);
        try {
          await this.refreshToken(accountId);
        } catch (error) {
          console.warn(`[TikTok] Token refresh failed on connect:`, error);
        }
      }

      // Validate connection by calling TikTok API
      await this.validateConnection(session);

      // Initialize rate limit state
      this.rateLimitState.set(accountId, {
        timestamps: [],
        lastConversationTime: new Map(),
      });

      // Start polling for messages
      this.startPolling(accountId);

      this.emitConnection(accountId, 'connected');
      this.emitStatus({
        accountId,
        status: 'connected',
        lastConnectedAt: new Date(),
      });

      console.log(`[TikTok] Shop ${creds.shopId} connected successfully`);
      return { success: true, status: 'connected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TikTok] Failed to connect ${accountId}:`, error);
      this.emitConnection(accountId, 'error', message);
      return { success: false, error: message };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    console.log(`[TikTok] Disconnecting shop ${session.credentials.shopId}`);

    if (session.pollingInterval) {
      clearInterval(session.pollingInterval);
    }

    this.sessions.delete(accountId);
    this.rateLimitState.delete(accountId);
    this.appSecrets.delete(accountId);
    this.emitConnection(accountId, 'disconnected');
  }

  async shutdown(): Promise<void> {
    console.log('[TikTok] Shutting down all sessions...');

    for (const [accountId, session] of this.sessions) {
      if (session.pollingInterval) {
        clearInterval(session.pollingInterval);
      }
    }

    this.sessions.clear();
    console.log('[TikTok] All sessions shut down');
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const session = this.sessions.get(params.accountId);
    if (!session) {
      return { success: false, error: 'Session not connected', retryable: true };
    }

    try {
      // Apply rate limiting
      await this.enforceRateLimit(params.accountId, params.recipientId);

      // Ensure valid token
      await this.ensureValidToken(params.accountId);

      // Build message payload
      let messagePayload: Record<string, unknown>;

      switch (params.contentType) {
        case 'text':
          messagePayload = {
            message_type: 'TEXT',
            content: { text: params.content },
          };
          break;
        case 'image':
          messagePayload = {
            message_type: 'IMAGE',
            content: { image_url: params.mediaUrl },
          };
          break;
        case 'video':
          messagePayload = {
            message_type: 'VIDEO',
            content: { video_url: params.mediaUrl },
          };
          break;
        default:
          // Default to text for unsupported types
          messagePayload = {
            message_type: 'TEXT',
            content: { text: params.content || '[Unsupported message type]' },
          };
      }

      const response = await this.apiRequest(
        session,
        'POST',
        '/api/customer_service/conversations/messages',
        {
          conversation_id: params.recipientId,
          ...messagePayload,
        }
      ) as { code?: number; data?: { message_id?: string }; message?: string };

      if (response.code === 0 && response.data?.message_id) {
        console.log(`[TikTok] Message sent: ${response.data.message_id}`);
        return {
          success: true,
          messageId: response.data.message_id,
          timestamp: new Date(),
        };
      } else {
        throw new Error(response.message || 'Failed to send message');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TikTok] Send message error:`, error);
      return { success: false, error: message, retryable: true };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    // TikTok Shop only supports text and images in DMs
    if (params.contentType !== 'image' && params.contentType !== 'video') {
      return { success: false, error: 'TikTok Shop only supports text, image, and video messages' };
    }

    return this.sendMessage({
      ...params,
      content: params.mediaUrl,
    });
  }

  async refreshToken(
    accountId: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    const creds = session.credentials;

    try {
      const response = await fetch(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: creds.appKey,
          app_secret: creds.appSecret,
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const data = (await response.json()) as {
        code: number;
        message?: string;
        data?: {
          access_token: string;
          refresh_token: string;
          access_token_expire_in: number;
        };
      };

      if (data.code !== 0 || !data.data) {
        throw new Error(`Token refresh failed: ${data.message || 'No data returned'}`);
      }

      // Update session with new tokens
      session.credentials.accessToken = data.data.access_token;
      session.credentials.refreshToken = data.data.refresh_token;
      session.credentials.tokenExpiresAt = Date.now() + data.data.access_token_expire_in * 1000;

      // Persist to database
      await this.persistTokenToDatabase(
        accountId,
        data.data.access_token,
        data.data.refresh_token,
        session.credentials.tokenExpiresAt
      );

      console.log(`[TikTok] Token refreshed for ${accountId}`);

      return {
        accessToken: data.data.access_token,
        refreshToken: data.data.refresh_token,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TikTok] Token refresh error:`, message);
      throw error;
    }
  }

  /**
   * Persist tokens to database
   */
  private async persistTokenToDatabase(
    accountId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void> {
    try {
      const { db } = await import('../../db/index.js');
      const { accounts } = await import('../../db/schema.js');
      const { eq } = await import('drizzle-orm');

      await db
        .update(accounts)
        .set({
          credentials: {
            accessToken,
            refreshToken,
            tokenExpiresAt: expiresAt,
          },
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      console.log(`[TikTok] Persisted refreshed tokens for ${accountId}`);
    } catch (error) {
      console.error(`[TikTok] Failed to persist tokens:`, error);
    }
  }

  async getConversations(accountId: string, pageSize: number = 20): Promise<TikTokConversation[]> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.ensureValidToken(accountId);

    const response = await this.apiRequest(session, 'GET', '/api/customer_service/conversations', {
      page_size: pageSize,
    }) as { code?: number; data?: { conversations?: TikTokConversation[] } };

    if (response.code === 0 && response.data?.conversations) {
      return response.data.conversations;
    }

    return [];
  }

  /**
   * Get messages in a conversation
   */
  async getConversationMessages(
    accountId: string,
    conversationId: string,
    pageSize: number = 50
  ): Promise<TikTokMessage[]> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.ensureValidToken(accountId);

    const response = await this.apiRequest(
      session,
      'GET',
      `/api/customer_service/conversations/${encodeURIComponent(conversationId)}/messages`,
      { page_size: pageSize }
    ) as { code?: number; data?: { messages?: TikTokMessage[] } };

    if (response.code === 0 && response.data?.messages) {
      return response.data.messages;
    }

    return [];
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    accountId: string,
    signature: string,
    timestamp: string,
    body: string
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      console.error(`[TikTok] Webhook received for unknown account: ${accountId}`);
      return;
    }

    // Verify webhook signature
    if (!this.verifyWebhookSignature(accountId, signature, timestamp, body)) {
      console.error(`[TikTok] Invalid webhook signature for account ${accountId}`);
      return;
    }

    let payload: { type?: string; data?: TikTokMessage };
    try {
      payload = JSON.parse(body);
    } catch {
      console.error(`[TikTok] Invalid JSON in webhook body`);
      return;
    }

    console.log(`[TikTok] Webhook received: ${payload.type}`);

    // Handle message events
    if (
      payload.type === 'REVERSE_MESSAGE_SEND' ||
      payload.type === 'CONVERSATION_MESSAGE' ||
      payload.type === 'CUSTOMER_SERVICE_MESSAGE'
    ) {
      await this.handleIncomingMessage(accountId, payload.data || (payload as unknown as TikTokMessage));
    }
  }

  /**
   * Verify webhook signature with timestamp validation
   */
  private verifyWebhookSignature(
    accountId: string,
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    const appSecret = this.appSecrets.get(accountId);
    if (!appSecret) {
      console.warn(`[TikTok] No app secret found for account ${accountId}`);
      return false;
    }

    // Security: Reject missing signatures in production
    if (!signature) {
      console.warn(`[TikTok] No signature in webhook - rejecting for security`);
      return process.env.NODE_ENV === 'development';
    }

    let sigTimestamp = timestamp;
    let sigValue = signature;

    // Parse t=timestamp,s=signature format
    if (signature.includes(',')) {
      const parts = signature.split(',');
      const tPart = parts.find((p) => p.startsWith('t='));
      const sPart = parts.find((p) => p.startsWith('s='));
      if (tPart && sPart) {
        sigTimestamp = tPart.slice(2);
        sigValue = sPart.slice(2);
      }
    }

    // Validate timestamp
    const timestampNum = parseInt(sigTimestamp, 10);
    if (isNaN(timestampNum)) {
      console.warn(`[TikTok] Invalid webhook timestamp: ${sigTimestamp}`);
      return false;
    }

    // Security: Reject timestamps older than 5 minutes
    const timeDiff = Math.abs(Date.now() / 1000 - timestampNum);
    if (timeDiff > 300) {
      console.warn(`[TikTok] Webhook timestamp too old: ${timeDiff}s`);
      return false;
    }

    // Compute expected signature: HMAC-SHA256(timestamp.body)
    const signPayload = `${sigTimestamp}.${body}`;
    const expectedSig = crypto.createHmac('sha256', appSecret).update(signPayload).digest('hex');

    // Constant-time comparison
    if (sigValue.length !== expectedSig.length) {
      console.warn(`[TikTok] Signature length mismatch`);
      return false;
    }

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(sigValue, 'utf8'),
        Buffer.from(expectedSig, 'utf8')
      );

      if (!isValid) {
        console.warn(`[TikTok] Signature mismatch`);
      }

      return isValid;
    } catch {
      console.error(`[TikTok] Signature verification error`);
      return false;
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
   * Start polling for messages
   */
  private startPolling(accountId: string): void {
    const session = this.sessions.get(accountId);
    if (!session) return;

    session.pollingInterval = setInterval(async () => {
      try {
        await this.pollMessages(accountId);
      } catch (error) {
        console.error(`[TikTok] Polling error for ${accountId}:`, error);
      }
    }, POLL_INTERVAL_MS);

    // Initial poll
    this.pollMessages(accountId).catch(console.error);
  }

  /**
   * Poll for new messages
   */
  private async pollMessages(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    try {
      await this.ensureValidToken(accountId);

      const conversations = await this.getConversations(accountId);

      for (const conv of conversations) {
        const messages = await this.getConversationMessages(accountId, conv.conversation_id);

        for (const msg of messages) {
          // Only process messages newer than last poll
          const msgTime = msg.create_time < 10000000000 ? msg.create_time * 1000 : msg.create_time;
          if (msgTime <= session.lastPollTime) continue;

          // Skip seller messages
          if (msg.sender_type === 'SELLER') continue;

          await this.handleIncomingMessage(accountId, msg, conv);
        }
      }

      session.lastPollTime = Date.now();
    } catch (error) {
      console.error(`[TikTok] Poll messages error:`, error);
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(
    accountId: string,
    msg: TikTokMessage,
    conv?: TikTokConversation
  ): Promise<void> {
    // Skip seller messages
    if (msg.sender_type === 'SELLER') return;

    let contentType: 'text' | 'image' | 'video' = 'text';
    let content: string | undefined;
    let mediaUrl: string | undefined;

    switch (msg.message_type) {
      case 'TEXT':
        contentType = 'text';
        content = msg.content.text;
        break;
      case 'IMAGE':
        contentType = 'image';
        mediaUrl = msg.content.image_url;
        break;
      case 'VIDEO':
        contentType = 'video';
        mediaUrl = msg.content.video_url;
        break;
      case 'PRODUCT_CARD':
        contentType = 'text';
        content = `[Product: ${msg.content.product_id || 'Unknown'}]`;
        break;
      default:
        contentType = 'text';
        content = '[Unsupported message type]';
    }

    // Handle timestamp (seconds vs milliseconds)
    let messageTimestamp: Date;
    if (msg.create_time) {
      const ts = msg.create_time;
      messageTimestamp = new Date(ts < 10000000000 ? ts * 1000 : ts);
    } else {
      messageTimestamp = new Date();
    }

    const incomingMessage: IncomingMessage = {
      channelType: 'tiktok',
      channelAccountId: accountId,
      channelMessageId: msg.message_id || `tiktok_${Date.now()}`,
      chatId: msg.conversation_id,
      isGroup: false,
      senderId: conv?.buyer_user_id || 'unknown',
      senderName: undefined,
      contentType,
      content,
      mediaUrl,
      timestamp: messageTimestamp,
      isFromMe: false, // We filter out SELLER messages above, so this is always from buyer
      rawMessage: msg,
    };

    console.log(`[TikTok] Incoming message from ${incomingMessage.senderId}: ${contentType}`);
    await this.emitMessage(incomingMessage);
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest(
    session: TikTokSession,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const url = new URL(TIKTOK_API_BASE + path);
    const creds = session.credentials;

    // Build query params
    const queryParams: Record<string, string> = {
      app_key: creds.appKey,
      timestamp,
      shop_cipher: creds.shopCipher,
    };

    // For GET requests, include params in query
    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        queryParams[key] = String(value);
      });
    }

    // Generate signature
    const signature = this.generateSignature(creds.appSecret, path, queryParams);

    // Set URL query params
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set('sign', signature);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': creds.accessToken,
      },
    };

    if (method !== 'GET' && params) {
      fetchOptions.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), fetchOptions);

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  /**
   * Generate API signature
   */
  private generateSignature(
    appSecret: string,
    path: string,
    params: Record<string, unknown>
  ): string {
    // Sort params alphabetically
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map((key) => {
        const value = params[key];
        const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `${key}${strValue}`;
      })
      .join('');

    // Format: app_secret + path + sorted_params + app_secret
    const signPayload = `${appSecret}${path}${signString}${appSecret}`;

    return crypto.createHmac('sha256', appSecret).update(signPayload).digest('hex');
  }

  /**
   * Validate connection by calling TikTok API
   */
  private async validateConnection(session: TikTokSession): Promise<void> {
    const response = await this.apiRequest(session, 'GET', '/api/shop/get_authorized_shop', {});

    if ((response as { code: number }).code !== 0) {
      throw new Error(
        `Shop validation failed: ${(response as { message?: string }).message || 'Unknown error'}`
      );
    }

    console.log(`[TikTok] Connection validated for shop ${session.credentials.shopId}`);
  }

  /**
   * Ensure access token is valid
   */
  private async ensureValidToken(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) return;

    // Refresh if expires in less than 5 minutes
    if (Date.now() >= (session.credentials.tokenExpiresAt || 0) - 300000) {
      console.log(`[TikTok] Refreshing token for shop ${session.credentials.shopId}`);
      await this.refreshToken(accountId);
    }
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(accountId: string, conversationId: string): Promise<void> {
    let state = this.rateLimitState.get(accountId);
    if (!state) {
      state = { timestamps: [], lastConversationTime: new Map() };
      this.rateLimitState.set(accountId, state);
    }

    const now = Date.now();
    const windowMs = 1000;

    // Clean old timestamps
    state.timestamps = state.timestamps.filter((ts) => now - ts < windowMs);

    // Check global rate limit (50 per second)
    if (state.timestamps.length >= TIKTOK_RATE_LIMITS.REQUESTS_PER_SECOND) {
      const oldestTimestamp = state.timestamps[0];
      if (oldestTimestamp !== undefined) {
        const waitTime = Math.max(0, windowMs - (now - oldestTimestamp) + 50);
        if (waitTime > 0) {
          console.log(`[TikTok] Global rate limit reached, waiting ${waitTime}ms`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    // Check per-conversation rate limit
    const lastConvTime = state.lastConversationTime.get(conversationId) || 0;
    const currentTime = Date.now();
    const convElapsed = currentTime - lastConvTime;

    if (convElapsed < TIKTOK_RATE_LIMITS.MIN_CONVERSATION_DELAY_MS) {
      const waitTime = TIKTOK_RATE_LIMITS.MIN_CONVERSATION_DELAY_MS - convElapsed;
      console.log(`[TikTok] Conversation rate limit, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Record this request
    const recordTime = Date.now();
    state.timestamps.push(recordTime);
    state.lastConversationTime.set(conversationId, recordTime);
  }
}
