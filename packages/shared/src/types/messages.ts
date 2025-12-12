import type { ChannelType, ContentType, MessageStatus } from './index.js';

// ============================================
// INCOMING MESSAGE (From any channel)
// ============================================

export interface IncomingMessage {
  // Channel identification
  channelType: ChannelType;
  channelAccountId: string;
  channelMessageId: string;

  // Chat/conversation info
  chatId: string; // Channel-specific chat identifier
  isGroup: boolean;
  groupId?: string;
  groupName?: string;

  // Sender info
  senderId: string;
  senderName?: string;
  senderProfilePic?: string;

  // Content
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaFileSize?: number;

  // Quoted message
  replyToMessageId?: string;
  replyToContent?: string;
  replyToSenderName?: string;

  // Metadata
  timestamp: Date;
  isForwarded?: boolean;
  isFromMe?: boolean;

  // Raw message for channel-specific handling
  rawMessage?: unknown;
}

// ============================================
// SEND MESSAGE PARAMS
// ============================================

export interface SendMessageParams {
  accountId: string;
  channelType: ChannelType;
  recipientId: string; // Channel-specific recipient ID (JID, chat_id, etc.)
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;

  // Reply
  replyToMessageId?: string;

  // Options
  isReply?: boolean; // True if responding to a contact's message (affects anti-ban delay)
  priority?: 'normal' | 'high'; // High priority skips queue

  // Twilio-like features
  idempotencyKey?: string;        // Unique key for request deduplication (max 64 chars)
  validityPeriod?: number;        // Message validity in seconds (default: 14400, max: 36000)
  sendAt?: string;                // ISO 8601 timestamp for scheduled sending
  statusCallback?: string;        // Per-message callback URL override
}

export interface SendMediaParams extends SendMessageParams {
  mediaUrl: string;
  mediaMimeType: string;
  thumbnail?: Buffer;
  caption?: string;
}

// ============================================
// SEND RESULT
// ============================================

export interface SendResult {
  success: boolean;
  messageId?: string;
  timestamp?: Date;
  error?: string;
  retryable?: boolean;

  // Twilio-like error codes
  errorCode?: number;           // Standardized error code (30xxx series)
  errorMessage?: string;        // Human-readable error description
  cached?: boolean;             // True if response from idempotency cache
  expiresAt?: Date;             // Message expiration timestamp
}

// ============================================
// MESSAGE QUEUE TYPES
// ============================================

export interface QueuedMessage {
  id: string;
  accountId: string;
  params: SendMessageParams;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface MessageQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

// ============================================
// BATCH OPERATIONS
// ============================================

export interface ContactInsert {
  accountId: string;
  channelType: ChannelType;
  channelContactId: string;
  name?: string;
  phoneNumber?: string;
  profilePicUrl?: string;
  jidType?: string;
}

export interface MessageInsert {
  conversationId: string;
  channelMessageId: string;
  channelType: ChannelType;
  senderType: 'agent' | 'contact' | 'system';
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  status: MessageStatus;
  senderJid?: string;
  senderName?: string;
  quotedChannelMessageId?: string;
  quotedContent?: string;
  quotedSenderName?: string;
  createdAt: Date;
}

export interface ConversationInsert {
  accountId: string;
  contactId?: string;
  groupId?: string;
  channelType: ChannelType;
  isGroup: boolean;
  channelChatId?: string;
}

// ============================================
// DEDUPLICATION
// ============================================

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingMessageId?: string;
  source: 'memory' | 'database' | 'none';
}

// ============================================
// HISTORY SYNC
// ============================================

export interface HistorySyncProgress {
  accountId: string;
  type: 'full' | 'recent' | 'on_demand';
  messagesTotal: number;
  messagesProcessed: number;
  contactsTotal: number;
  contactsProcessed: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================
// MESSAGE VALIDITY CONFIGURATION
// ============================================

export const VALIDITY_CONFIG = {
  DEFAULT_SECONDS: 14400,       // 4 hours default validity
  MAX_SECONDS: 36000,           // 10 hours maximum validity
  MIN_SECONDS: 60,              // 1 minute minimum validity
  CHECK_INTERVAL_MS: 60000,     // Check for expired messages every minute
} as const;

// ============================================
// IDEMPOTENCY CONFIGURATION
// ============================================

export const IDEMPOTENCY_CONFIG = {
  TTL_MS: 86400000,             // 24 hour idempotency window
  MAX_KEY_LENGTH: 64,           // Maximum idempotency key length
  CLEANUP_INTERVAL_MS: 3600000, // Cleanup expired keys every hour
} as const;
