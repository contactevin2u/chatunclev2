/**
 * Meta Adapter (Instagram & Facebook Messenger)
 *
 * Unified adapter for Meta's messaging platforms using Graph API.
 * Both Instagram and Messenger use the same underlying API structure.
 *
 * Key Features:
 * - OAuth 2.0 with Page Access Tokens
 * - Webhook-based message receiving
 * - 24-hour messaging window (7 days with HUMAN_AGENT tag)
 * - Rate limiting per page
 *
 * Requirements:
 * - Facebook Business Page (linked to Instagram for IG)
 * - Meta Developer App with Messenger/Instagram products
 * - Page Access Token with required permissions
 * - Instagram: instagram_basic, instagram_manage_messages
 * - Messenger: pages_messaging, pages_manage_metadata
 *
 * API Documentation:
 * - https://developers.facebook.com/docs/messenger-platform/
 * - https://developers.facebook.com/docs/instagram-api/guides/messaging
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
} from '../types';
import { execute } from '../../../config/database';

// Meta Graph API configuration
const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Rate limits for Meta platforms
const META_RATE_LIMITS = {
  // Messages per 24 hours = 200 * engaged_users (we'll be conservative)
  MIN_MESSAGE_DELAY_MS: 1000,  // 1 second between messages to same recipient
  REQUESTS_PER_HOUR: 200,     // Conservative hourly limit
};

// Messaging window limits
const MESSAGING_WINDOW = {
  STANDARD_HOURS: 24,         // Standard 24-hour window
  HUMAN_AGENT_DAYS: 7,        // Extended window with HUMAN_AGENT tag
};

interface MetaCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  instagramAccountId?: string;  // For Instagram, the IG business account ID
}

interface MetaPageInstance {
  accountId: string;
  channelType: 'instagram' | 'messenger';
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  instagramAccountId?: string;
  pageName?: string;
  startedAt: Date;
}

interface MetaRateLimitState {
  timestamps: number[];
  lastRecipientTime: Map<string, number>;  // recipientId -> last message time
}

interface MetaWebhookEntry {
  id: string;  // Page ID or IG account ID
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
 * MetaAdapter - Handles both Instagram and Facebook Messenger
 *
 * Instagram Requirements:
 * - Instagram Professional (Business/Creator) account
 * - Linked to a Facebook Page
 * - 1000+ followers for messaging API access
 *
 * Messenger Requirements:
 * - Facebook Business Page
 * - Page Access Token with pages_messaging permission
 */
export class MetaAdapter extends BaseChannelAdapter {
  // This adapter handles both instagram and messenger
  // The actual channel type is set per-instance in constructor
  readonly channelType: ChannelType;

  private pages: Map<string, MetaPageInstance> = new Map();
  private rateLimitState: Map<string, MetaRateLimitState> = new Map();
  private appSecrets: Map<string, string> = new Map();  // accountId -> appSecret
  private defaultChannelType: 'instagram' | 'messenger';

  constructor(channelType: 'instagram' | 'messenger' = 'instagram') {
    super();
    this.channelType = channelType;
    this.defaultChannelType = channelType;
    console.log(`[Meta] ${channelType} adapter initialized`);
  }

  /**
   * Connect to Meta API for a specific page/account
   */
  async connect(accountId: string, options: ConnectionOptions): Promise<void> {
    const credentials = options.credentials as MetaCredentials;
    const channelType = (options.settings?.channelType as 'instagram' | 'messenger') || this.defaultChannelType;

    if (!credentials?.pageId || !credentials?.pageAccessToken) {
      throw new Error('Meta pageId and pageAccessToken are required');
    }

    if (!credentials?.appSecret) {
      throw new Error('Meta appSecret is required for webhook verification');
    }

    if (channelType === 'instagram' && !credentials?.instagramAccountId) {
      throw new Error('Instagram account ID is required for Instagram messaging');
    }

    console.log(`[Meta] Connecting ${channelType} account ${accountId} (Page: ${credentials.pageId})`);

    try {
      this.emitStatusChange(accountId, 'connecting');

      // Store app secret for webhook verification
      this.appSecrets.set(accountId, credentials.appSecret);

      // Validate token by fetching page info
      const pageInfo = await this.validatePageToken(credentials.pageAccessToken, credentials.pageId);

      // Store page instance
      const page: MetaPageInstance = {
        accountId,
        channelType,
        pageId: credentials.pageId,
        pageAccessToken: credentials.pageAccessToken,
        appSecret: credentials.appSecret,
        instagramAccountId: credentials.instagramAccountId,
        pageName: pageInfo.name,
        startedAt: new Date(),
      };

      this.pages.set(accountId, page);

      // Initialize rate limit state
      this.rateLimitState.set(accountId, {
        timestamps: [],
        lastRecipientTime: new Map(),
      });

      this.emitStatusChange(accountId, 'connected');
      console.log(`[Meta] ${channelType} account ${accountId} connected (Page: ${pageInfo.name})`);

    } catch (error: any) {
      console.error(`[Meta] Connection failed for ${accountId}:`, error);
      this.emitStatusChange(accountId, 'error', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from Meta API
   */
  async disconnect(accountId: string): Promise<void> {
    const page = this.pages.get(accountId);
    if (!page) return;

    console.log(`[Meta] Disconnecting ${page.channelType} account ${accountId}`);

    this.pages.delete(accountId);
    this.rateLimitState.delete(accountId);
    this.appSecrets.delete(accountId);
    this.emitStatusChange(accountId, 'disconnected');
  }

  /**
   * Get page info for an account
   */
  getPageInfo(accountId: string): { pageId: string; pageName?: string; channelType: string } | undefined {
    const page = this.pages.get(accountId);
    if (!page) return undefined;
    return {
      pageId: page.pageId,
      pageName: page.pageName,
      channelType: page.channelType,
    };
  }

  /**
   * Send a message via Meta API
   */
  async sendMessage(
    accountId: string,
    recipientId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Promise<SendMessageResult> {
    const page = this.pages.get(accountId);
    if (!page) {
      return { success: false, error: 'Account not connected' };
    }

    try {
      // Apply rate limiting
      await this.enforceRateLimit(accountId, recipientId);

      // Build message payload based on channel type
      const messagePayload = this.buildMessagePayload(page.channelType, recipientId, message, options);

      // Determine the correct endpoint
      let endpoint: string;
      if (page.channelType === 'instagram') {
        if (!page.instagramAccountId) {
          return { success: false, error: 'Instagram account ID not configured' };
        }
        endpoint = `${page.instagramAccountId}/messages`;
      } else {
        endpoint = `${page.pageId}/messages`;
      }

      // Send via Graph API
      const response = await this.graphApiRequest(
        page.pageAccessToken,
        'POST',
        endpoint,
        messagePayload
      );

      if (response.message_id) {
        console.log(`[Meta] ${page.channelType} message sent: ${response.message_id}`);
        return {
          success: true,
          messageId: response.message_id,
        };
      } else {
        throw new Error(response.error?.message || 'Failed to send message');
      }

    } catch (error: any) {
      console.error(`[Meta] Failed to send message:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get contact profile
   */
  async getContactProfile(accountId: string, contactId: string): Promise<ContactProfile | null> {
    const page = this.pages.get(accountId);
    if (!page) return null;

    try {
      // Fetch user profile from Graph API
      const fields = page.channelType === 'instagram'
        ? 'id,username,name,profile_pic'
        : 'id,first_name,last_name,profile_pic';

      const response = await this.graphApiRequest(
        page.pageAccessToken,
        'GET',
        contactId,
        { fields }
      );

      return {
        channelUserId: contactId,
        displayName: page.channelType === 'instagram'
          ? response.name || response.username
          : `${response.first_name || ''} ${response.last_name || ''}`.trim(),
        username: response.username,
        profilePicUrl: response.profile_pic,
      };
    } catch (error) {
      console.error(`[Meta] Failed to get contact profile:`, error);
      return {
        channelUserId: contactId,
        displayName: page.channelType === 'instagram'
          ? `Instagram User ${contactId.slice(-6)}`
          : `Messenger User ${contactId.slice(-6)}`,
      };
    }
  }

  /**
   * Get active account IDs
   */
  getActiveAccounts(): string[] {
    return Array.from(this.pages.keys());
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    console.log('[Meta] Shutting down all page connections...');
    for (const accountId of this.pages.keys()) {
      await this.disconnect(accountId);
    }
  }

  /**
   * Process incoming webhook from Meta
   */
  async processWebhook(
    accountId: string,
    signature: string,
    body: string
  ): Promise<void> {
    const page = this.pages.get(accountId);
    if (!page) {
      console.error(`[Meta] Webhook received for unknown account: ${accountId}`);
      return;
    }

    // Verify webhook signature
    if (!this.verifyWebhookSignature(accountId, signature, body)) {
      console.error(`[Meta] Invalid webhook signature for account ${accountId}`);
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error(`[Meta] Invalid JSON in webhook body:`, parseError);
      return;
    }
    console.log(`[Meta] Webhook received: ${payload.object}`);

    // Handle different webhook object types
    if (payload.object === 'instagram' || payload.object === 'page') {
      for (const entry of (payload.entry || []) as MetaWebhookEntry[]) {
        await this.handleWebhookEntry(accountId, page, entry);
      }
    }
  }

  /**
   * Verify Meta webhook challenge (for initial webhook setup)
   */
  verifyWebhookChallenge(
    accountId: string,
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log(`[Meta] Webhook verified for account ${accountId}`);
      return challenge;
    }
    console.warn(`[Meta] Webhook verification failed for account ${accountId}`);
    return null;
  }

  // ============================================================
  // PRIVATE HELPER METHODS
  // ============================================================

  /**
   * Validate page access token
   */
  private async validatePageToken(accessToken: string, pageId: string): Promise<{ name: string; id: string }> {
    const response = await this.graphApiRequest(
      accessToken,
      'GET',
      pageId,
      { fields: 'id,name' }
    );

    if (!response.id) {
      throw new Error('Invalid page access token or page ID');
    }

    return response;
  }

  /**
   * Make a Graph API request
   */
  private async graphApiRequest(
    accessToken: string,
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params?: Record<string, any>
  ): Promise<any> {
    const url = new URL(`${GRAPH_API_BASE}/${endpoint}`);

    // Add access token
    url.searchParams.set('access_token', accessToken);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    } else if (method === 'POST' && params) {
      fetchOptions.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json() as Record<string, any>;

    if (!response.ok) {
      const errorMsg = data.error?.message || `API request failed (${response.status})`;
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Build message payload for sending
   */
  private buildMessagePayload(
    channelType: 'instagram' | 'messenger',
    recipientId: string,
    message: MessagePayload,
    options?: SendOptions
  ): Record<string, any> {
    const payload: Record<string, any> = {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',  // or 'MESSAGE_TAG' for outside 24h window
    };

    // Add message tag for outside 24h window (if specified)
    if (options?.metadata?.useHumanAgentTag) {
      payload.messaging_type = 'MESSAGE_TAG';
      payload.tag = 'HUMAN_AGENT';
    }

    // Build message content based on type
    switch (message.type) {
      case 'text':
        payload.message = { text: message.content };
        break;

      case 'image':
        payload.message = {
          attachment: {
            type: 'image',
            payload: { url: message.mediaUrl, is_reusable: true },
          },
        };
        break;

      case 'video':
        payload.message = {
          attachment: {
            type: 'video',
            payload: { url: message.mediaUrl, is_reusable: true },
          },
        };
        break;

      case 'audio':
        payload.message = {
          attachment: {
            type: 'audio',
            payload: { url: message.mediaUrl, is_reusable: true },
          },
        };
        break;

      case 'document':
        payload.message = {
          attachment: {
            type: 'file',
            payload: { url: message.mediaUrl, is_reusable: true },
          },
        };
        break;

      default:
        payload.message = { text: message.content || '[Unsupported message type]' };
    }

    return payload;
  }

  /**
   * Handle a webhook entry
   */
  private async handleWebhookEntry(
    accountId: string,
    page: MetaPageInstance,
    entry: MetaWebhookEntry
  ): Promise<void> {
    if (!entry.messaging) return;

    for (const event of entry.messaging) {
      // Skip if it's a delivery/read receipt
      if (event.delivery || event.read) continue;

      // Skip if the sender is the page itself (our own message)
      if (event.sender.id === page.pageId || event.sender.id === page.instagramAccountId) {
        continue;
      }

      if (event.message) {
        await this.handleIncomingMessage(accountId, page, event);
      } else if (event.postback) {
        // Handle postbacks (button clicks) as text messages
        await this.handlePostback(accountId, page, event);
      }
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(
    accountId: string,
    page: MetaPageInstance,
    event: MetaMessagingEvent
  ): Promise<void> {
    const msg = event.message!;

    // Determine content type and extract content
    let contentType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' = 'text';
    let content = '';
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

    // Build IncomingMessage
    // Meta timestamp is in milliseconds
    let messageTimestamp: Date;
    if (event.timestamp) {
      // If timestamp looks like seconds (< year 3000 in seconds), convert to ms
      const ts = event.timestamp;
      messageTimestamp = new Date(ts < 10000000000 ? ts * 1000 : ts);
    } else {
      messageTimestamp = new Date();
    }

    const incomingMessage: IncomingMessage = {
      channelType: page.channelType,
      channelAccountId: accountId,
      channelMessageId: msg.mid,
      chatId: event.sender.id,  // For Meta, chat ID = sender ID (1:1 only)
      senderId: event.sender.id,
      senderName: undefined,  // Will be fetched separately if needed
      contentType,
      content,
      mediaUrl,
      timestamp: messageTimestamp,
      isGroup: false,  // Meta messaging is always 1:1
      rawMessage: event,
      replyToMessageId: msg.reply_to?.mid,
    };

    console.log(`[Meta] ${page.channelType} message from ${event.sender.id}: ${contentType}`);

    // Emit to handlers
    await this.emitMessage(incomingMessage);
  }

  /**
   * Handle postback (button click)
   */
  private async handlePostback(
    accountId: string,
    page: MetaPageInstance,
    event: MetaMessagingEvent
  ): Promise<void> {
    const postback = event.postback!;

    const incomingMessage: IncomingMessage = {
      channelType: page.channelType,
      channelAccountId: accountId,
      channelMessageId: `postback_${event.timestamp}`,
      chatId: event.sender.id,
      senderId: event.sender.id,
      contentType: 'text',
      content: postback.title || postback.payload,
      timestamp: new Date(event.timestamp),
      isGroup: false,
      rawMessage: event,
    };

    await this.emitMessage(incomingMessage);
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(
    accountId: string,
    signature: string,
    body: string
  ): boolean {
    const appSecret = this.appSecrets.get(accountId);
    if (!appSecret) {
      console.warn(`[Meta] No app secret found for account ${accountId}`);
      return false;
    }

    if (!signature) {
      console.warn(`[Meta] No signature in webhook - rejecting for security`);
      // SECURITY: Always reject missing signatures in production
      return process.env.NODE_ENV === 'development';
    }

    // Meta signature format: sha256=SIGNATURE
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex');

    // Safe comparison that handles different lengths
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
    } catch (error) {
      console.error(`[Meta] Signature verification error:`, error);
      return false;
    }
  }

  /**
   * Enforce rate limiting
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
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Record this request
    const recordTime = Date.now();
    state.timestamps.push(recordTime);
    state.lastRecipientTime.set(recipientId, recordTime);

    // Clean old timestamps (older than 1 hour)
    const oneHourAgo = recordTime - 3600000;
    state.timestamps = state.timestamps.filter(ts => ts > oneHourAgo);
  }
}

// Export singleton instances for each channel type
export const instagramAdapter = new MetaAdapter('instagram');
export const messengerAdapter = new MetaAdapter('messenger');
