import type { AccountRole, AccountStatus, ChannelType } from './index.js';

// ============================================
// CHANNEL ADAPTER INTERFACES
// ============================================

export interface ChannelConfig {
  // Common config
  maxRetries?: number;
  retryDelayMs?: number;

  // WhatsApp specific
  whatsapp?: {
    browserName?: string;
    browserVersion?: string;
    syncHistory?: boolean;
    maxHistoryDays?: number;
  };

  // Telegram specific
  telegram?: {
    useWebhook?: boolean;
    webhookUrl?: string;
  };

  // TikTok specific
  tiktok?: {
    pollIntervalMs?: number;
  };

  // Meta specific
  meta?: {
    apiVersion?: string;
  };
}

export interface ConnectionResult {
  success: boolean;
  status?: AccountStatus;
  error?: string;
  qrCode?: string;
  pairingCode?: string;
}

export interface ConnectionStatus {
  accountId: string;
  status: AccountStatus;
  lastConnectedAt?: Date;
  error?: string;
}

// ============================================
// CREDENTIAL TYPES (Per channel)
// ============================================

export interface WhatsAppCredentials {
  // Stored in PostgresAuthState
  authStateId?: string;
}

export interface TelegramCredentials {
  botToken: string;
  botUsername?: string;
}

export interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  shopCipher: string;
  tokenExpiresAt: Date;
}

export interface MetaCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  instagramAccountId?: string; // For Instagram
  tokenExpiresAt?: Date;
}

export type ChannelCredentials =
  | WhatsAppCredentials
  | TelegramCredentials
  | TikTokCredentials
  | MetaCredentials;

// ============================================
// ACCOUNT MANAGEMENT
// ============================================

export interface CreateAccountParams {
  userId: string;
  channelType: ChannelType;
  channelIdentifier?: string;
  phoneNumber?: string;
  credentials?: ChannelCredentials;
}

export interface UpdateAccountParams {
  status?: AccountStatus;
  channelIdentifier?: string;
  phoneNumber?: string;
  credentials?: ChannelCredentials;
  settings?: Record<string, unknown>;
  incognitoMode?: boolean;
  lastConnectedAt?: Date;
}

export interface AccountWithAccess {
  id: string;
  userId: string;
  channelType: ChannelType;
  channelIdentifier: string;
  phoneNumber?: string;
  status: AccountStatus;
  incognitoMode: boolean;
  lastConnectedAt?: Date;
  createdAt: Date;
  role: AccountRole; // From account_access
}

// ============================================
// ACCOUNT ACCESS MANAGEMENT
// ============================================

export interface GrantAccessParams {
  accountId: string;
  agentId: string;
  role: AccountRole;
}

export interface AccountAccessInfo {
  agentId: string;
  agentName: string;
  agentEmail: string;
  role: AccountRole;
  grantedAt: Date;
}

// ============================================
// ANTI-BAN CONFIGURATION
// ============================================

export interface RateLimitConfig {
  // Reply mode (responding to contacts)
  replyMinDelayMs: number;
  replyMaxDelayMs: number;

  // Bulk mode (scheduled/broadcast)
  bulkMinDelayMs: number;
  bulkMaxDelayMs: number;

  // Same contact limit (WhatsApp enforced)
  minSameContactDelayMs: number;

  // Overall rate
  messagesPerMinute: number;

  // Typing simulation
  minTypingMs: number;
  maxTypingMs: number;
}

export interface DailyLimitConfig {
  accountAgeDays: number;
  maxNewContacts: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  replyMinDelayMs: 300,      // 0.3 seconds
  replyMaxDelayMs: 1500,     // 1.5 seconds
  bulkMinDelayMs: 2000,      // 2 seconds
  bulkMaxDelayMs: 5000,      // 5 seconds
  minSameContactDelayMs: 6000, // 6 seconds (WhatsApp limit)
  messagesPerMinute: 15,
  minTypingMs: 500,
  maxTypingMs: 2000,
};

export const DAILY_LIMITS_BY_AGE: DailyLimitConfig[] = [
  { accountAgeDays: 1, maxNewContacts: 30 },
  { accountAgeDays: 3, maxNewContacts: 50 },
  { accountAgeDays: 7, maxNewContacts: 100 },
  { accountAgeDays: 14, maxNewContacts: 200 },
  { accountAgeDays: 30, maxNewContacts: 500 },
  { accountAgeDays: Infinity, maxNewContacts: 1000 },
];
