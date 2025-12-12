// ============================================
// BATCH PROCESSING CONFIGURATION
// ============================================

export const BATCH_CONFIG = {
  // === LIVE MESSAGE PROCESSING ===
  MESSAGE_BATCH_SIZE: 50,        // Process 50 messages in parallel
  CONTACT_BATCH_SIZE: 200,       // Batch insert 200 contacts
  GROUP_BATCH_SIZE: 20,          // Process 20 groups in parallel
  BATCH_DELAY_MS: 10,            // Minimal delay between batches

  // === HISTORY SYNC (Background) ===
  HISTORY_MESSAGE_BATCH_SIZE: 100,
  HISTORY_GROUP_BATCH_SIZE: 50,
  HISTORY_CONTACT_BATCH_SIZE: 500,

  // === DATABASE CONNECTION POOL ===
  DB_POOL_SIZE: 20,              // Max concurrent connections
  DB_IDLE_TIMEOUT_MS: 30000,     // 30 seconds idle timeout
} as const;

// ============================================
// ANTI-BAN RATE LIMITS
// ============================================

export const RATE_LIMITS = {
  // === REPLY MODE: Fast conversational responses ===
  REPLY_MIN_DELAY_MS: 300,   // 0.3 seconds
  REPLY_MAX_DELAY_MS: 1500,  // 1.5 seconds

  // === BULK MODE: Scheduled/broadcast (more cautious) ===
  BULK_MIN_DELAY_MS: 2000,   // 2 seconds
  BULK_MAX_DELAY_MS: 5000,   // 5 seconds

  // === SAME CONTACT LIMIT (WhatsApp enforced) ===
  MIN_SAME_CONTACT_DELAY_MS: 6000,  // 6 seconds

  // === OVERALL RATE LIMIT ===
  MESSAGES_PER_MINUTE: 15,  // Conservative (WhatsApp allows ~80/sec)

  // === TYPING SIMULATION ===
  MIN_TYPING_MS: 500,   // 0.5 seconds
  MAX_TYPING_MS: 2000,  // 2 seconds (presence expires at 10s)

  // === BATCH COOLDOWN ===
  BATCH_SIZE_BEFORE_COOLDOWN: 50,
  BATCH_COOLDOWN_MS: 300000, // 5 minutes
} as const;

// ============================================
// DAILY LIMITS BY ACCOUNT AGE
// ============================================

export const DAILY_LIMITS_BY_AGE = [
  { ageDays: 1, maxNewContacts: 30 },
  { ageDays: 3, maxNewContacts: 50 },
  { ageDays: 7, maxNewContacts: 100 },
  { ageDays: 14, maxNewContacts: 200 },
  { ageDays: 30, maxNewContacts: 500 },
  { ageDays: Infinity, maxNewContacts: 1000 },
] as const;

// ============================================
// DEDUPLICATION CONFIGURATION
// ============================================

export const DEDUP_CONFIG = {
  // Memory cache settings
  MEMORY_MAX_ENTRIES: 150000,
  MEMORY_TTL_MS: 7200000, // 2 hours

  // DB check cache (avoid repeated queries)
  DB_CHECK_CACHE_TTL_MS: 300000, // 5 minutes
} as const;

// ============================================
// MESSAGE QUEUE CONFIGURATION
// ============================================

export const QUEUE_CONFIG = {
  // p-queue settings for WhatsApp
  WHATSAPP_CONCURRENCY: 1,
  WHATSAPP_INTERVAL_MS: 1000,
  WHATSAPP_MAX_SIZE: 500,

  // BullMQ job settings
  SCHEDULED_MESSAGE_CONCURRENCY: 5,
  HISTORY_SYNC_CONCURRENCY: 2,
  MEDIA_PROCESSING_CONCURRENCY: 3,

  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
} as const;

// ============================================
// SOCKET.IO CONFIGURATION
// ============================================

export const SOCKET_CONFIG = {
  // Room prefixes
  ROOM_USER: 'user:',
  ROOM_ACCOUNT: 'account:',
  ROOM_CONVERSATION: 'conversation:',

  // Ping settings
  PING_INTERVAL_MS: 25000,
  PING_TIMEOUT_MS: 20000,
} as const;

// ============================================
// API CONFIGURATION
// ============================================

export const API_CONFIG = {
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,

  // File upload
  MAX_FILE_SIZE_MB: 50,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/3gpp', 'video/quicktime'],
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
} as const;

// ============================================
// WHATSAPP SPECIFIC
// ============================================

export const WHATSAPP_CONFIG = {
  // Browser info for Baileys
  BROWSER_NAME: 'ChatUncle',
  BROWSER_VERSION: '2.0.0',

  // Session settings
  SYNC_FULL_HISTORY: false,
  MAX_HISTORY_DAYS: 30,
  MARK_ONLINE_ON_CONNECT: true,

  // Media settings
  MAX_IMAGE_SIZE_MB: 16,
  MAX_VIDEO_SIZE_MB: 64,
  MAX_AUDIO_SIZE_MB: 16,
  MAX_DOCUMENT_SIZE_MB: 100,

  // Version caching - don't fetch version more often than this
  VERSION_CACHE_MS: 3600000, // 1 hour

  // Pairing code requires Chrome/macOS browser
  PAIRING_CODE_BROWSER: ['macOS', 'Google Chrome'] as const,
} as const;

// ============================================
// TELEGRAM SPECIFIC
// ============================================

export const TELEGRAM_CONFIG = {
  // Webhook settings
  USE_WEBHOOK: true, // Use webhooks in production, long polling in dev

  // File limits
  MAX_FILE_SIZE_MB: 50,
} as const;

// ============================================
// TIKTOK SPECIFIC
// ============================================

export const TIKTOK_CONFIG = {
  // API settings
  API_BASE_URL: 'https://open-api.tiktokglobalshop.com',
  API_VERSION: '202309',

  // Polling settings (TikTok doesn't support webhooks for DMs)
  POLL_INTERVAL_MS: 30000, // 30 seconds
} as const;

// ============================================
// META (INSTAGRAM/MESSENGER) SPECIFIC
// ============================================

export const META_CONFIG = {
  // API settings
  GRAPH_API_BASE: 'https://graph.facebook.com',
  GRAPH_API_VERSION: 'v21.0',

  // Message limits
  INSTAGRAM_MAX_TEXT_LENGTH: 1000,
  MESSENGER_MAX_TEXT_LENGTH: 2000,

  // 24-hour window
  RESPONSE_WINDOW_HOURS: 24,
  HUMAN_AGENT_TAG_WINDOW_DAYS: 7,
} as const;
