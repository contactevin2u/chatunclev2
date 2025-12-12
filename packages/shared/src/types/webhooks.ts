import type { ChannelType, MessageStatus, ContentType } from './index.js';

// ============================================
// WEBHOOK EVENT TYPES
// ============================================

export type WebhookEventType =
  // Message lifecycle events
  | 'message.queued'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'message.expired'
  // Conversation events
  | 'conversation.created'
  | 'conversation.state_changed'
  | 'conversation.timer_fired'
  | 'conversation.assigned'
  // Incoming events
  | 'message.received'
  // Account events
  | 'account.connected'
  | 'account.disconnected'
  | 'account.error';

// ============================================
// WEBHOOK CONFIGURATION
// ============================================

export interface WebhookConfig {
  id: string;
  accountId: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
  failedAttempts: number;
  lastFailedAt?: Date;
  lastSucceededAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookParams {
  accountId: string;
  url: string;
  events: WebhookEventType[];
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  isActive?: boolean;
}

// ============================================
// WEBHOOK DELIVERY
// ============================================

export type WebhookDeliveryStatus =
  | 'pending'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'exhausted'; // All retries used

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  payload: WebhookPayload;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  lastAttemptAt?: Date;
  lastError?: string;
  lastResponseStatus?: number;
  createdAt: Date;
  deliveredAt?: Date;
}

// ============================================
// WEBHOOK PAYLOAD TYPES
// ============================================

export interface WebhookPayload {
  eventType: WebhookEventType;
  accountId: string;
  timestamp: string; // ISO 8601
  requestId: string;
  data: WebhookEventData;
}

export type WebhookEventData =
  | MessageStatusEventData
  | MessageReceivedEventData
  | ConversationEventData
  | AccountEventData;

// Message status callback (queued, sent, delivered, read, failed, expired)
export interface MessageStatusEventData {
  messageSid: string;
  channelMessageId?: string;
  conversationId: string;
  status: MessageStatus;
  errorCode?: number;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  expiredAt?: string;
}

// Incoming message webhook
export interface MessageReceivedEventData {
  messageSid: string;
  channelMessageId: string;
  conversationId: string;
  channelType: ChannelType;
  senderId: string;
  senderName?: string;
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  isGroup: boolean;
  timestamp: string;
}

// Conversation events
export interface ConversationEventData {
  conversationId: string;
  previousState?: string;
  currentState: string;
  reason?: string;
  timerType?: 'inactivity' | 'close';
  assignedAgentId?: string;
  timestamp: string;
}

// Account events
export interface AccountEventData {
  accountId: string;
  channelType: ChannelType;
  status: string;
  error?: string;
  timestamp: string;
}

// ============================================
// WEBHOOK SIGNATURE
// ============================================

export interface WebhookSignature {
  timestamp: number;
  signature: string;
}

export interface WebhookHeaders {
  'X-ChatUncle-Signature': string;
  'X-ChatUncle-Request-Id': string;
  'X-ChatUncle-Timestamp': string;
  'Content-Type': 'application/json';
}

// ============================================
// WEBHOOK CONFIGURATION CONSTANTS
// ============================================

export const WEBHOOK_CONFIG = {
  // Retry configuration
  MAX_RETRIES: 5,
  INITIAL_BACKOFF_MS: 1000,      // 1 second
  MAX_BACKOFF_MS: 300000,        // 5 minutes
  BACKOFF_MULTIPLIER: 2,

  // Request configuration
  REQUEST_TIMEOUT_MS: 30000,     // 30 seconds
  MAX_PAYLOAD_SIZE_BYTES: 65536, // 64KB

  // Signature
  SIGNATURE_ALGORITHM: 'sha256',
  SIGNATURE_HEADER: 'X-ChatUncle-Signature',

  // Disable threshold
  MAX_CONSECUTIVE_FAILURES: 10,
} as const;

// ============================================
// WEBHOOK TEST
// ============================================

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  error?: string;
  requestId: string;
}

// ============================================
// WEBHOOK DELIVERY STATS
// ============================================

export interface WebhookDeliveryStats {
  webhookId: string;
  period: 'hour' | 'day' | 'week';
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageResponseTimeMs: number;
  successRate: number;
}
