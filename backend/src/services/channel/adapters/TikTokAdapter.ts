/**
 * TikTok Shop Customer Service Adapter
 *
 * Implements TikTok Shop's Customer Service API for seller-buyer messaging.
 *
 * Features:
 * - OAuth 2.0 authentication with token refresh
 * - Send/receive messages via Customer Service API
 * - Webhook handling for incoming messages
 * - Rate limiting (50 req/sec per store)
 * - 24-hour response window tracking
 *
 * API Documentation: https://partner.tiktokshop.com/docv2/page/customer-service-api-overview
 */

import crypto from 'crypto';
import {
  BaseChannelAdapter,
  ConnectionOptions,
  SendOptions,
} from '../IChannelAdapter';
import {
  ChannelType,
  MessagePayload,
  IncomingMessage,
  ContactProfile,
  SendMessageResult,
  ConnectionStatus,
} from '../types';
import { execute } from '../../../config/database';

// TikTok Shop API configuration
const TIKTOK_API_BASE = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_BASE = 'https://auth.tiktok-shops.com';

// Rate limits for TikTok Shop API
const TIKTOK_RATE_LIMITS = {
  // 50 requests per second per store
  REQUESTS_PER_SECOND: 50,
  // Minimum delay between messages to same conversation (ms)
  MIN_CONVERSATION_DELAY_MS: 1000,
  // Retry backoff settings
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 32000,
  MAX_RETRIES: 5,
};

interface TikTokShopInstance {
  accountId: string;
  shopId: string;
  shopCipher: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  appKey: string;
  appSecret: string;
  startedAt: Date;
}

interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  shopId: string;
  shopCipher: string;
  tokenExpiresAt?: number;
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

// Global rate limiter state (per shop)
interface ShopRateLimitState {
  timestamps: number[]; // Sliding window
  lastConversationTime: Map<string, number>; // conversation_id -> last message time
}

export class TikTokAdapter extends BaseChannelAdapter {
  readonly channelType: ChannelType = 'tiktok';

  private shops: Map<string, TikTokShopInstance> = new Map();
  private rateLimitState: Map<string, ShopRateLimitState> = new Map();

  // Webhook signature verification key (set per app)
  private appSecrets: Map<string, string> = new Map(); // accountId -> appSecret

  /**
   * Connect to TikTok Shop API for a specific account
   */
  async connect(accountId: string, options: ConnectionOptions): Promise<void> {
    const credentials = options.credentials as TikTokCredentials;

    if (!credentials?.appKey || !credentials?.appSecret) {
      throw new Error('TikTok Shop appKey and appSecret are required');
    }

    if (!credentials?.accessToken || !credentials?.refreshToken) {
      throw new Error('TikTok Shop accessToken and refreshToken are required. Complete OAuth flow first.');
    }

    if (!credentials?.shopId || !credentials?.shopCipher) {
      throw new Error('TikTok Shop shopId and shopCipher are required');
    }

    console.log(`[TikTok] Connecting shop ${credentials.shopId} for account ${accountId}`);

    try {
      this.emitStatusChange(accountId, 'connecting');

      // Store app secret for webhook verification
      this.appSecrets.set(accountId, credentials.appSecret);

      // Check if token needs refresh
      let accessToken = credentials.accessToken;
      let tokenExpiresAt = credentials.tokenExpiresAt || 0;

      // Store shop instance first (needed for API calls)
      const shop: TikTokShopInstance = {
        accountId,
        shopId: credentials.shopId,
        shopCipher: credentials.shopCipher,
        accessToken,
        refreshToken: credentials.refreshToken,
        tokenExpiresAt,
        appKey: credentials.appKey,
        appSecret: credentials.appSecret,
        startedAt: new Date(),
      };

      this.shops.set(accountId, shop);

      // Refresh token if expired or expiring soon
      if (Date.now() >= tokenExpiresAt - 60000) { // Refresh if expires in < 1 minute
        console.log(`[TikTok] Token expired or expiring soon, refreshing...`);
        const refreshResult = await this.refreshAccessToken(
          credentials.appKey,
          credentials.appSecret,
          credentials.refreshToken
        );
        shop.accessToken = refreshResult.accessToken;
        shop.refreshToken = refreshResult.refreshToken;
        shop.tokenExpiresAt = refreshResult.expiresAt;

        // Persist refreshed tokens
        try {
          await execute(
            `UPDATE channel_accounts
             SET credentials = jsonb_set(
               jsonb_set(
                 jsonb_set(credentials::jsonb, '{accessToken}', $1::jsonb),
                 '{refreshToken}', $2::jsonb
               ),
               '{tokenExpiresAt}', $3::jsonb
             ),
             updated_at = NOW()
             WHERE id = $4`,
            [
              JSON.stringify(refreshResult.accessToken),
              JSON.stringify(refreshResult.refreshToken),
              JSON.stringify(refreshResult.expiresAt),
              accountId
            ]
          );
        } catch (dbError) {
          console.error(`[TikTok] Failed to persist tokens on connect:`, dbError);
        }
      }

      // Validate connection by calling TikTok API
      await this.validateConnection(shop);

      // Initialize rate limit state
      this.rateLimitState.set(accountId, {
        timestamps: [],
        lastConversationTime: new Map(),
      });

      this.emitStatusChange(accountId, 'connected');
      console.log(`[TikTok] Shop ${credentials.shopId} connected successfully`);

    } catch (error: any) {
      console.error(`[TikTok] Connection failed for ${accountId}:`, error);
      this.emitStatusChange(accountId, 'error', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from TikTok Shop API
   */
  async disconnect(accountId: string): Promise<void> {
    const shop = this.shops.get(accountId);
    if (!shop) return;

    console.log(`[TikTok] Disconnecting shop ${shop.shopId}`);

    this.shops.delete(accountId);
    this.rateLimitState.delete(accountId);
    this.appSecrets.delete(accountId);
    this.emitStatusChange(accountId, 'disconnected');
  }

  /**
   * Get shop info for an account
   */
  getShopInfo(accountId: string): { shopId: string; shopCipher: string } | undefined {
    const shop = this.shops.get(accountId);
    if (!shop) return undefined;
    return { shopId: shop.shopId, shopCipher: shop.shopCipher };
  }

  /**
   * Send a message to a TikTok Shop conversation
   */
  async sendMessage(
    accountId: string,
    conversationId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Promise<SendMessageResult> {
    const shop = this.shops.get(accountId);
    if (!shop) {
      return { success: false, error: 'Shop not connected' };
    }

    try {
      // Apply rate limiting
      await this.enforceRateLimit(accountId, conversationId);

      // Refresh token if needed
      await this.ensureValidToken(accountId);

      // Build message payload based on type
      let messagePayload: any;

      switch (message.type) {
        case 'text':
          messagePayload = {
            message_type: 'TEXT',
            content: {
              text: message.content,
            },
          };
          break;

        case 'image':
          messagePayload = {
            message_type: 'IMAGE',
            content: {
              image_url: message.mediaUrl,
            },
          };
          break;

        case 'video':
          messagePayload = {
            message_type: 'VIDEO',
            content: {
              video_url: message.mediaUrl,
            },
          };
          break;

        default:
          // Default to text for unsupported types
          messagePayload = {
            message_type: 'TEXT',
            content: {
              text: message.content || message.caption || '[Unsupported message type]',
            },
          };
      }

      // Send message via TikTok API
      const response = await this.apiRequest(
        shop,
        'POST',
        '/api/customer_service/conversations/messages',
        {
          conversation_id: conversationId,
          ...messagePayload,
        }
      );

      if (response.code === 0 && response.data?.message_id) {
        console.log(`[TikTok] Message sent: ${response.data.message_id}`);
        return {
          success: true,
          messageId: response.data.message_id,
        };
      } else {
        throw new Error(response.message || 'Failed to send message');
      }

    } catch (error: any) {
      console.error(`[TikTok] Failed to send message:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get contact profile (buyer info)
   */
  async getContactProfile(accountId: string, contactId: string): Promise<ContactProfile | null> {
    // TikTok Shop API doesn't expose detailed buyer profiles for privacy
    // Return minimal info based on conversation data
    return {
      channelUserId: contactId,
      displayName: `TikTok Buyer ${contactId.slice(-6)}`,
    };
  }

  /**
   * Get active account IDs
   */
  getActiveAccounts(): string[] {
    return Array.from(this.shops.keys());
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    console.log('[TikTok] Shutting down all shop connections...');

    for (const accountId of this.shops.keys()) {
      await this.disconnect(accountId);
    }
  }

  /**
   * Get conversations for a shop
   */
  async getConversations(accountId: string, pageSize: number = 20): Promise<TikTokConversation[]> {
    const shop = this.shops.get(accountId);
    if (!shop) {
      throw new Error('Shop not connected');
    }

    await this.ensureValidToken(accountId);

    const response = await this.apiRequest(
      shop,
      'GET',
      '/api/customer_service/conversations',
      { page_size: pageSize }
    );

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
    const shop = this.shops.get(accountId);
    if (!shop) {
      throw new Error('Shop not connected');
    }

    await this.ensureValidToken(accountId);

    const response = await this.apiRequest(
      shop,
      'GET',
      `/api/customer_service/conversations/${encodeURIComponent(conversationId)}/messages`,
      { page_size: pageSize }
    );

    if (response.code === 0 && response.data?.messages) {
      return response.data.messages;
    }

    return [];
  }

  /**
   * Process incoming webhook from TikTok
   * Called by the webhook route handler
   */
  async processWebhook(
    accountId: string,
    signature: string,
    timestamp: string,
    body: string
  ): Promise<void> {
    const shop = this.shops.get(accountId);
    if (!shop) {
      console.error(`[TikTok] Webhook received for unknown account: ${accountId}`);
      return;
    }

    // Verify webhook signature
    if (!this.verifyWebhookSignature(accountId, signature, timestamp, body)) {
      console.error(`[TikTok] Invalid webhook signature for account ${accountId}`);
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error(`[TikTok] Invalid JSON in webhook body:`, parseError);
      return;
    }
    console.log(`[TikTok] Webhook received: ${payload.type}`);

    // Handle different webhook event types
    switch (payload.type) {
      case 'REVERSE_MESSAGE_SEND':
      case 'CONVERSATION_MESSAGE':
      case 'CUSTOMER_SERVICE_MESSAGE':
        await this.handleIncomingMessage(accountId, payload);
        break;

      default:
        console.log(`[TikTok] Unhandled webhook type: ${payload.type}`);
    }
  }

  /**
   * Handle incoming message webhook
   */
  private async handleIncomingMessage(accountId: string, payload: any): Promise<void> {
    const shop = this.shops.get(accountId);
    if (!shop) return;

    const data = payload.data || payload;

    // Skip if this is our own message
    if (data.sender_type === 'SELLER') {
      return;
    }

    // Determine content type
    let contentType: 'text' | 'image' | 'video' | 'document' = 'text';
    let content = '';
    let mediaUrl: string | undefined;

    switch (data.message_type) {
      case 'TEXT':
        contentType = 'text';
        content = data.content?.text || '';
        break;
      case 'IMAGE':
        contentType = 'image';
        mediaUrl = data.content?.image_url;
        break;
      case 'VIDEO':
        contentType = 'video';
        mediaUrl = data.content?.video_url;
        break;
      case 'PRODUCT_CARD':
        contentType = 'text';
        content = `[Product: ${data.content?.product_id || 'Unknown'}]`;
        break;
      default:
        contentType = 'text';
        content = '[Unsupported message type]';
    }

    // Build IncomingMessage
    // Handle timestamp - could be seconds, milliseconds, or undefined
    let messageTimestamp: Date;
    if (data.create_time) {
      // If timestamp is in seconds (less than year 3000 in seconds), convert to ms
      const ts = typeof data.create_time === 'number' ? data.create_time : parseInt(data.create_time, 10);
      messageTimestamp = new Date(ts < 10000000000 ? ts * 1000 : ts);
    } else {
      messageTimestamp = new Date();
    }

    const incomingMessage: IncomingMessage = {
      channelType: 'tiktok',
      channelAccountId: accountId,
      channelMessageId: data.message_id || `tiktok_${Date.now()}`,
      chatId: data.conversation_id,
      senderId: data.buyer_user_id || data.sender_id || 'unknown',
      senderName: undefined, // TikTok doesn't expose buyer names
      contentType,
      content,
      mediaUrl,
      timestamp: messageTimestamp,
      isGroup: false, // TikTok Shop is always 1:1
      rawMessage: payload,
    };

    console.log(`[TikTok] Incoming message from ${incomingMessage.senderId}: ${contentType}`);

    // Emit to handlers
    await this.emitMessage(incomingMessage);
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  /**
   * Make an authenticated API request to TikTok Shop
   */
  private async apiRequest(
    shop: TikTokShopInstance,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params?: Record<string, any>
  ): Promise<any> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const url = new URL(TIKTOK_API_BASE + path);

    // Build all query params (including body params for signature)
    const allParams: Record<string, string> = {
      app_key: shop.appKey,
      timestamp,
      shop_cipher: shop.shopCipher,
    };

    // For GET requests, include query params in signature
    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        allParams[key] = String(value);
      });
    }

    // Generate signature with all params
    const signature = this.generateSignature(shop.appSecret, path, allParams);

    // Set URL query params
    Object.entries(allParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set('sign', signature);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': shop.accessToken,
      },
    };

    if (method !== 'GET' && params) {
      fetchOptions.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), fetchOptions);

    // Check for rate limiting before parsing
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    // Check if response is OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Generate API request signature
   * TikTok signature format: HMAC-SHA256(app_secret + path + sorted_params + app_secret)
   */
  private generateSignature(
    appSecret: string,
    path: string,
    params: Record<string, any>
  ): string {
    // Sort params alphabetically and create sign string
    // Convert all values to strings, handle objects/arrays
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map(key => {
        const value = params[key];
        const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `${key}${strValue}`;
      })
      .join('');

    const signPayload = `${appSecret}${path}${signString}${appSecret}`;

    return crypto
      .createHmac('sha256', appSecret)
      .update(signPayload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   * TikTok uses HMAC-SHA256 for webhook verification
   * Signature format varies by TikTok API version
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

    // SECURITY: Reject missing signatures in production
    if (!signature) {
      console.warn(`[TikTok] No signature in webhook - rejecting for security`);
      return process.env.NODE_ENV === 'development';
    }

    // Try different signature formats that TikTok may use
    let sigTimestamp = timestamp;
    let sigValue = signature;

    // Format 1: t=timestamp,s=signature (comma-separated)
    if (signature.includes(',')) {
      const parts = signature.split(',');
      const tPart = parts.find(p => p.startsWith('t='));
      const sPart = parts.find(p => p.startsWith('s='));
      if (tPart && sPart) {
        sigTimestamp = tPart.slice(2);
        sigValue = sPart.slice(2);
      }
    }

    // Validate timestamp is a number
    const timestampNum = parseInt(sigTimestamp, 10);
    if (isNaN(timestampNum)) {
      console.warn(`[TikTok] Invalid webhook timestamp: ${sigTimestamp}`);
      return false;
    }

    // Check timestamp is recent (within 5 minutes)
    const timeDiff = Math.abs(Date.now() / 1000 - timestampNum);
    if (timeDiff > 300) {
      console.warn(`[TikTok] Webhook timestamp too old: ${timeDiff}s`);
      return false;
    }

    // Compute expected signature
    // TikTok format: HMAC-SHA256(timestamp.body)
    const signPayload = `${sigTimestamp}.${body}`;
    const expectedSig = crypto
      .createHmac('sha256', appSecret)
      .update(signPayload)
      .digest('hex');

    const isValid = sigValue === expectedSig;
    if (!isValid) {
      console.warn(`[TikTok] Signature mismatch. Expected: ${expectedSig.slice(0, 10)}..., Got: ${sigValue.slice(0, 10)}...`);
    }

    return isValid;
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(
    appKey: string,
    appSecret: string,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
    const response = await fetch(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: appKey,
        app_secret: appSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json() as {
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

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: Date.now() + (data.data.access_token_expire_in * 1000),
    };
  }

  /**
   * Validate connection by fetching shop info from TikTok API
   */
  private async validateConnection(shop: TikTokShopInstance): Promise<void> {
    if (!shop.accessToken || !shop.shopCipher) {
      throw new Error('Invalid credentials: missing accessToken or shopCipher');
    }

    // Call TikTok API to validate the connection
    try {
      const response = await this.apiRequest(
        shop,
        'GET',
        '/api/shop/get_authorized_shop',
        {}
      );

      if (response.code !== 0) {
        throw new Error(`Shop validation failed: ${response.message || 'Unknown error'}`);
      }

      console.log(`[TikTok] Connection validated for shop ${shop.shopId}`);
    } catch (error: any) {
      // If it's a network error or API error, throw with context
      throw new Error(`Failed to validate TikTok connection: ${error.message}`);
    }
  }

  /**
   * Ensure access token is valid, refresh if needed
   */
  private async ensureValidToken(accountId: string): Promise<void> {
    const shop = this.shops.get(accountId);
    if (!shop) return;

    // Check if token expires in less than 5 minutes
    if (Date.now() >= shop.tokenExpiresAt - 300000) {
      console.log(`[TikTok] Refreshing token for shop ${shop.shopId}`);

      const result = await this.refreshAccessToken(
        shop.appKey,
        shop.appSecret,
        shop.refreshToken
      );

      shop.accessToken = result.accessToken;
      shop.refreshToken = result.refreshToken;
      shop.tokenExpiresAt = result.expiresAt;

      // Persist new tokens to database
      try {
        await execute(
          `UPDATE channel_accounts
           SET credentials = jsonb_set(
             jsonb_set(
               jsonb_set(credentials::jsonb, '{accessToken}', $1::jsonb),
               '{refreshToken}', $2::jsonb
             ),
             '{tokenExpiresAt}', $3::jsonb
           ),
           updated_at = NOW()
           WHERE id = $4`,
          [
            JSON.stringify(result.accessToken),
            JSON.stringify(result.refreshToken),
            JSON.stringify(result.expiresAt),
            accountId
          ]
        );
        console.log(`[TikTok] Persisted refreshed tokens for ${accountId}`);
      } catch (dbError) {
        console.error(`[TikTok] Failed to persist refreshed tokens:`, dbError);
      }
    }
  }

  /**
   * Enforce rate limiting (50 req/sec per shop + per-conversation delay)
   */
  private async enforceRateLimit(accountId: string, conversationId: string): Promise<void> {
    let state = this.rateLimitState.get(accountId);
    if (!state) {
      state = { timestamps: [], lastConversationTime: new Map() };
      this.rateLimitState.set(accountId, state);
    }

    const now = Date.now();
    const windowMs = 1000; // 1 second window

    // Clean old timestamps
    state.timestamps = state.timestamps.filter(ts => now - ts < windowMs);

    // Check global rate limit (50 per second)
    if (state.timestamps.length >= TIKTOK_RATE_LIMITS.REQUESTS_PER_SECOND) {
      const oldestTimestamp = state.timestamps[0];
      // Only wait if there are timestamps and the oldest is within the window
      if (oldestTimestamp !== undefined) {
        const waitTime = Math.max(0, windowMs - (now - oldestTimestamp) + 50);
        if (waitTime > 0) {
          console.log(`[TikTok] Global rate limit reached, waiting ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // Check per-conversation rate limit
    const lastConvTime = state.lastConversationTime.get(conversationId) || 0;
    const currentTime = Date.now(); // Get fresh timestamp after potential wait
    const convElapsed = currentTime - lastConvTime;

    if (convElapsed < TIKTOK_RATE_LIMITS.MIN_CONVERSATION_DELAY_MS) {
      const waitTime = TIKTOK_RATE_LIMITS.MIN_CONVERSATION_DELAY_MS - convElapsed;
      console.log(`[TikTok] Conversation rate limit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Record this request with single timestamp
    const recordTime = Date.now();
    state.timestamps.push(recordTime);
    state.lastConversationTime.set(conversationId, recordTime);
  }
}

// Export singleton instance
export const tiktokAdapter = new TikTokAdapter();
