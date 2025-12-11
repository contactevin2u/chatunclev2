import { query, queryOne, execute } from '../config/database';

/**
 * Anti-Ban Service for WhatsApp
 *
 * Implements best practices to avoid WhatsApp account bans:
 * - Rate limiting (6-12 messages per minute)
 * - Random delays between messages (human-like behavior)
 * - Typing indicator simulation
 * - Daily message limits based on account age
 * - Batch processing with cooldowns
 * - Account warm-up period tracking
 *
 * Sources:
 * - https://green-api.com/en/blog/reduce-the-risk-of-WA-blocking/
 * - https://wasender.com/blog/save-number-from-banning/
 * - https://support.whapi.cloud/help-desk/blocking/how-to-not-get-banned
 */

// Rate limiting configuration
// Based on research: https://wasender.com/blog/save-number-from-banning/
// WhatsApp pair rate limit: 1 message per 6 seconds to same contact
// Per-second rate limit: 80 messages/second per business number
const RATE_LIMITS = {
  // Messages per minute (WhatsApp allows ~80/sec, but we're conservative)
  MESSAGES_PER_MINUTE: 15,

  // === REPLY MODE: For conversational replies (already in chat) ===
  // These should be SHORT for fast responses
  REPLY_MIN_DELAY_MS: 300,   // 0.3 seconds minimum
  REPLY_MAX_DELAY_MS: 1500,  // 1.5 seconds maximum

  // === BULK MODE: For scheduled/broadcast messages to different contacts ===
  // These are longer to avoid detection
  BULK_MIN_DELAY_MS: 2000,   // 2 seconds minimum
  BULK_MAX_DELAY_MS: 5000,   // 5 seconds maximum

  // Legacy defaults (used by getRandomDelay without context)
  MIN_DELAY_MS: 500,
  MAX_DELAY_MS: 2000,

  // Typing indicator duration (keep short - presence expires after 10s)
  MIN_TYPING_MS: 500,   // 0.5 seconds
  MAX_TYPING_MS: 2000,  // 2 seconds max

  // Cooldown between batches in ms (5 minutes is enough)
  BATCH_COOLDOWN_MS: 5 * 60 * 1000,

  // Maximum messages per batch before cooldown
  BATCH_SIZE: 50,

  // Daily limits based on account age (days)
  DAILY_LIMITS: {
    0: 30,    // Day 0-1: max 30 new contacts
    1: 50,    // Day 1-3: max 50 new contacts
    3: 100,   // Day 3-7: max 100 new contacts
    7: 200,   // Day 7-14: max 200 new contacts
    14: 500,  // Day 14-30: max 500 new contacts
    30: 1000, // Day 30+: max 1000 new contacts
  } as Record<number, number>,

  // Warm-up period in days (highest risk period)
  WARMUP_PERIOD_DAYS: 7,
};

// In-memory tracking for rate limiting
interface AccountRateState {
  messageTimestamps: number[];
  lastMessageTime: number;
  dailyNewContacts: number;
  dailyResetDate: string;
  batchCount: number;
  lastBatchTime: number;
}

const accountRateStates = new Map<string, AccountRateState>();

// Per-contact rate limiting - track last message time to each contact
// Key: accountId:contactWaId, Value: timestamp
const contactLastMessageTime = new Map<string, number>();

// Minimum delay between messages to the SAME contact (prevents spam detection)
const MIN_SAME_CONTACT_DELAY_MS = 6000; // 6 seconds - WhatsApp's pair rate limit

// Cache for hasMessagedContactBefore to avoid DB queries
// Key: accountId:contactWaId, Value: boolean
const contactMessagedCache = new Map<string, boolean>();

// Get or create rate state for an account
function getAccountRateState(accountId: string): AccountRateState {
  if (!accountRateStates.has(accountId)) {
    const today = new Date().toISOString().split('T')[0];
    accountRateStates.set(accountId, {
      messageTimestamps: [],
      lastMessageTime: 0,
      dailyNewContacts: 0,
      dailyResetDate: today,
      batchCount: 0,
      lastBatchTime: 0,
    });
  }

  const state = accountRateStates.get(accountId)!;

  // Reset daily counter if new day
  const today = new Date().toISOString().split('T')[0];
  if (state.dailyResetDate !== today) {
    state.dailyNewContacts = 0;
    state.dailyResetDate = today;
    state.batchCount = 0;
  }

  return state;
}

// Clean old timestamps from rate state
function cleanOldTimestamps(state: AccountRateState): void {
  const oneMinuteAgo = Date.now() - 60000;
  state.messageTimestamps = state.messageTimestamps.filter(ts => ts > oneMinuteAgo);
}

/**
 * Generate a random delay between min and max milliseconds
 */
export function getRandomDelay(min: number = RATE_LIMITS.MIN_DELAY_MS, max: number = RATE_LIMITS.MAX_DELAY_MS): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate typing indicator duration (human-like)
 * Average typing speed: 40-60 WPM = 200-300 chars/min = ~50ms per char
 * We use a more natural range with variation
 */
export function getTypingDuration(messageLength: number = 50): number {
  // Base: ~40-80ms per character (realistic typing speed)
  const msPerChar = 40 + Math.random() * 40; // 40-80ms per char
  const baseDuration = messageLength * msPerChar;

  // Add random "thinking" pauses (simulates human hesitation)
  const thinkingPause = Math.random() * 500; // 0-500ms random pause

  // Total duration with min/max bounds
  const totalDuration = baseDuration + thinkingPause;

  // Minimum 800ms (feels natural), maximum 8 seconds (don't look like bot)
  // WhatsApp presence expires after 10s, so stay under that
  return Math.min(Math.max(totalDuration, 800), 8000);
}

/**
 * Get delay for reply mode (conversational, fast response)
 */
export function getReplyDelay(): number {
  return getRandomDelay(RATE_LIMITS.REPLY_MIN_DELAY_MS, RATE_LIMITS.REPLY_MAX_DELAY_MS);
}

/**
 * Get delay for bulk mode (scheduled/broadcast, slower)
 */
export function getBulkDelay(): number {
  return getRandomDelay(RATE_LIMITS.BULK_MIN_DELAY_MS, RATE_LIMITS.BULK_MAX_DELAY_MS);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get account age in days from creation date
 * Backward-compatible: uses whatsapp_accounts directly
 */
export async function getAccountAgeDays(accountId: string): Promise<number> {
  const account = await queryOne(
    'SELECT created_at FROM whatsapp_accounts WHERE id = $1',
    [accountId]
  );

  if (!account) return 0;

  const createdAt = new Date(account.created_at);
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get daily message limit based on account age
 */
export async function getDailyLimit(accountId: string): Promise<number> {
  const ageDays = await getAccountAgeDays(accountId);

  // Find appropriate limit based on account age
  let limit = RATE_LIMITS.DAILY_LIMITS[30]; // Default to max

  for (const [days, dayLimit] of Object.entries(RATE_LIMITS.DAILY_LIMITS)) {
    if (ageDays >= parseInt(days)) {
      limit = dayLimit;
    }
  }

  return limit;
}

/**
 * Check if account is in warm-up period (higher risk)
 */
export async function isInWarmupPeriod(accountId: string): Promise<boolean> {
  const ageDays = await getAccountAgeDays(accountId);
  return ageDays < RATE_LIMITS.WARMUP_PERIOD_DAYS;
}

/**
 * Check if we can send a message (rate limiting)
 * Returns true if allowed, false if should wait
 */
export async function canSendMessage(accountId: string): Promise<{ allowed: boolean; waitMs: number; reason?: string }> {
  const state = getAccountRateState(accountId);
  cleanOldTimestamps(state);

  const now = Date.now();

  // Check messages per minute
  if (state.messageTimestamps.length >= RATE_LIMITS.MESSAGES_PER_MINUTE) {
    const oldestTimestamp = state.messageTimestamps[0];
    const waitMs = 60000 - (now - oldestTimestamp);
    return {
      allowed: false,
      waitMs: Math.max(0, waitMs),
      reason: `Rate limit: ${RATE_LIMITS.MESSAGES_PER_MINUTE} messages per minute exceeded`,
    };
  }

  // Check minimum delay between messages
  const timeSinceLastMessage = now - state.lastMessageTime;
  if (timeSinceLastMessage < RATE_LIMITS.MIN_DELAY_MS) {
    return {
      allowed: false,
      waitMs: RATE_LIMITS.MIN_DELAY_MS - timeSinceLastMessage,
      reason: 'Minimum delay between messages not met',
    };
  }

  return { allowed: true, waitMs: 0 };
}

/**
 * Check if we can send to a new contact (daily limit)
 */
export async function canSendToNewContact(accountId: string): Promise<{ allowed: boolean; reason?: string }> {
  const state = getAccountRateState(accountId);
  const dailyLimit = await getDailyLimit(accountId);

  if (state.dailyNewContacts >= dailyLimit) {
    const ageDays = await getAccountAgeDays(accountId);
    return {
      allowed: false,
      reason: `Daily new contact limit reached (${dailyLimit}/day for ${ageDays}-day old account)`,
    };
  }

  return { allowed: true };
}

/**
 * Record that a message was sent (for rate tracking)
 */
export function recordMessageSent(accountId: string, isNewContact: boolean = false): void {
  const state = getAccountRateState(accountId);
  const now = Date.now();

  state.messageTimestamps.push(now);
  state.lastMessageTime = now;

  if (isNewContact) {
    state.dailyNewContacts++;
  }

  cleanOldTimestamps(state);
}

/**
 * Check if we need a batch cooldown
 */
export function needsBatchCooldown(accountId: string): { needed: boolean; waitMs: number } {
  const state = getAccountRateState(accountId);
  const now = Date.now();

  if (state.batchCount >= RATE_LIMITS.BATCH_SIZE) {
    const timeSinceLastBatch = now - state.lastBatchTime;
    if (timeSinceLastBatch < RATE_LIMITS.BATCH_COOLDOWN_MS) {
      return {
        needed: true,
        waitMs: RATE_LIMITS.BATCH_COOLDOWN_MS - timeSinceLastBatch,
      };
    }
    // Reset batch counter after cooldown
    state.batchCount = 0;
    state.lastBatchTime = now;
  }

  return { needed: false, waitMs: 0 };
}

/**
 * Record batch progress
 */
export function recordBatchMessage(accountId: string): void {
  const state = getAccountRateState(accountId);
  state.batchCount++;

  if (state.batchCount === 1) {
    state.lastBatchTime = Date.now();
  }
}

/**
 * Check if we can send to a specific contact (per-contact rate limiting)
 * WhatsApp pair rate limit: 1 message per 6 seconds to same contact
 */
export function canSendToContact(accountId: string, contactWaId: string): { allowed: boolean; waitMs: number; reason?: string } {
  const key = `${accountId}:${contactWaId}`;
  const lastSent = contactLastMessageTime.get(key) || 0;
  const now = Date.now();
  const elapsed = now - lastSent;

  if (elapsed < MIN_SAME_CONTACT_DELAY_MS) {
    return {
      allowed: false,
      waitMs: MIN_SAME_CONTACT_DELAY_MS - elapsed,
      reason: `Per-contact rate limit: wait ${Math.ceil((MIN_SAME_CONTACT_DELAY_MS - elapsed) / 1000)}s before messaging same contact`,
    };
  }

  return { allowed: true, waitMs: 0 };
}

/**
 * Record message sent to a specific contact (for per-contact rate limiting)
 */
export function recordContactMessage(accountId: string, contactWaId: string): void {
  const key = `${accountId}:${contactWaId}`;
  contactLastMessageTime.set(key, Date.now());

  // Cleanup old entries periodically (keep last 1000)
  if (contactLastMessageTime.size > 1000) {
    const entries = Array.from(contactLastMessageTime.entries());
    entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp desc
    contactLastMessageTime.clear();
    entries.slice(0, 500).forEach(([k, v]) => contactLastMessageTime.set(k, v));
  }
}

/**
 * Check if we've messaged a contact before (cached to avoid DB queries)
 */
export function hasMessagedContactCached(accountId: string, contactWaId: string): boolean | undefined {
  const key = `${accountId}:${contactWaId}`;
  return contactMessagedCache.get(key);
}

/**
 * Set cached value for hasMessagedContact
 */
export function setMessagedContactCache(accountId: string, contactWaId: string, hasMessaged: boolean): void {
  const key = `${accountId}:${contactWaId}`;
  contactMessagedCache.set(key, hasMessaged);

  // Cleanup old entries periodically (keep last 5000)
  if (contactMessagedCache.size > 5000) {
    const entries = Array.from(contactMessagedCache.entries());
    contactMessagedCache.clear();
    entries.slice(-2500).forEach(([k, v]) => contactMessagedCache.set(k, v));
  }
}

/**
 * Get anti-ban statistics for an account
 */
export async function getAntiBanStats(accountId: string): Promise<{
  accountAgeDays: number;
  isWarmupPeriod: boolean;
  dailyLimit: number;
  dailyNewContactsSent: number;
  messagesLastMinute: number;
  batchCount: number;
  rateStatus: 'safe' | 'caution' | 'warning';
}> {
  const state = getAccountRateState(accountId);
  cleanOldTimestamps(state);

  const ageDays = await getAccountAgeDays(accountId);
  const dailyLimit = await getDailyLimit(accountId);
  const isWarmup = ageDays < RATE_LIMITS.WARMUP_PERIOD_DAYS;

  // Determine rate status
  let rateStatus: 'safe' | 'caution' | 'warning' = 'safe';
  const usagePercent = state.dailyNewContacts / dailyLimit;

  if (usagePercent > 0.8) {
    rateStatus = 'warning';
  } else if (usagePercent > 0.5 || isWarmup) {
    rateStatus = 'caution';
  }

  return {
    accountAgeDays: ageDays,
    isWarmupPeriod: isWarmup,
    dailyLimit,
    dailyNewContactsSent: state.dailyNewContacts,
    messagesLastMinute: state.messageTimestamps.length,
    batchCount: state.batchCount,
    rateStatus,
  };
}

/**
 * Wait for rate limit (if needed)
 * For conversational replies, this should rarely block
 */
export async function waitForRateLimit(accountId: string): Promise<void> {
  // Check rate limit
  let check = await canSendMessage(accountId);

  while (!check.allowed) {
    console.log(`[AntiBan] Rate limit active for ${accountId}, waiting ${check.waitMs}ms. Reason: ${check.reason}`);
    await sleep(check.waitMs + getRandomDelay(100, 500)); // Small buffer
    check = await canSendMessage(accountId);
  }

  // NO additional random delay here - typing indicator handles the human-like behavior
  // This function is only for rate limiting, not for adding arbitrary delays
}

/**
 * Check if contact has been messaged before (for new contact tracking)
 */
export async function hasMessagedContactBefore(accountId: string, contactWaId: string): Promise<boolean> {
  const existing = await queryOne(`
    SELECT 1 FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.account_id = $1 AND ct.wa_id = $2 AND m.sender_type = 'agent'
    LIMIT 1
  `, [accountId, contactWaId]);

  return !!existing;
}

/**
 * Full pre-send check with all anti-ban measures
 * Returns true if safe to send, false if should abort
 */
export async function preSendCheck(
  accountId: string,
  contactWaId: string,
  options: { skipNewContactCheck?: boolean } = {}
): Promise<{ canSend: boolean; reason?: string }> {
  // Check per-contact rate limit first (prevents spamming same contact)
  const contactCheck = canSendToContact(accountId, contactWaId);
  if (!contactCheck.allowed) {
    console.log(`[AntiBan] Per-contact rate limit: waiting ${contactCheck.waitMs}ms`);
    // Wait for per-contact limit automatically
    await sleep(contactCheck.waitMs);
  }

  // Check if new contact and within limits (use cache first)
  if (!options.skipNewContactCheck) {
    let hasMessaged = hasMessagedContactCached(accountId, contactWaId);

    // If not in cache, check DB and cache the result
    if (hasMessaged === undefined) {
      hasMessaged = await hasMessagedContactBefore(accountId, contactWaId);
      setMessagedContactCache(accountId, contactWaId, hasMessaged);
    }

    if (!hasMessaged) {
      const newContactCheck = await canSendToNewContact(accountId);
      if (!newContactCheck.allowed) {
        return { canSend: false, reason: newContactCheck.reason };
      }
    }
  }

  // Check batch cooldown
  const batchCheck = needsBatchCooldown(accountId);
  if (batchCheck.needed) {
    console.log(`[AntiBan] Batch cooldown needed: ${batchCheck.waitMs}ms`);
    // For batch cooldown, we wait automatically
    await sleep(batchCheck.waitMs);
  }

  // Wait for rate limit
  await waitForRateLimit(accountId);

  return { canSend: true };
}

/**
 * Post-send recording
 * Call this after successfully sending a message
 */
export async function postSendRecord(accountId: string, contactWaId: string): Promise<void> {
  // Check cache first, then DB if needed
  let hasMessaged = hasMessagedContactCached(accountId, contactWaId);
  if (hasMessaged === undefined) {
    hasMessaged = await hasMessagedContactBefore(accountId, contactWaId);
  }

  // Record general message stats
  recordMessageSent(accountId, !hasMessaged);
  recordBatchMessage(accountId);

  // Record per-contact rate limit timestamp
  recordContactMessage(accountId, contactWaId);

  // Update cache - they've now been messaged
  setMessagedContactCache(accountId, contactWaId, true);
}

/**
 * Check if a JID is a group JID
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Pre-send check for group messages
 * Groups don't need new contact tracking, but still need rate limiting
 */
export async function preSendCheckGroup(accountId: string): Promise<{ canSend: boolean; reason?: string }> {
  // Check batch cooldown
  const batchCheck = needsBatchCooldown(accountId);
  if (batchCheck.needed) {
    console.log(`[AntiBan] Group batch cooldown needed: ${batchCheck.waitMs}ms`);
    await sleep(batchCheck.waitMs);
  }

  // Wait for rate limit
  await waitForRateLimit(accountId);

  return { canSend: true };
}

/**
 * Post-send recording for group messages
 * Only records rate limiting, not new contact tracking
 */
export function postSendRecordGroup(accountId: string): void {
  recordMessageSent(accountId, false); // Never count as new contact
  recordBatchMessage(accountId);
}

/**
 * Universal pre-send check - works for both 1:1 and group messages
 * Detects group JIDs automatically
 */
export async function preSendCheckUniversal(
  accountId: string,
  jid: string
): Promise<{ canSend: boolean; reason?: string }> {
  if (isGroupJid(jid)) {
    return preSendCheckGroup(accountId);
  }
  // For 1:1 contacts, extract wa_id from JID (remove suffix)
  const waId = jid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
  return preSendCheck(accountId, waId);
}

/**
 * Universal post-send recording - works for both 1:1 and group messages
 */
export async function postSendRecordUniversal(
  accountId: string,
  jid: string
): Promise<void> {
  if (isGroupJid(jid)) {
    postSendRecordGroup(accountId);
    return;
  }
  // For 1:1 contacts, extract wa_id from JID
  const waId = jid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
  await postSendRecord(accountId, waId);
}

// Export configuration for reference
export const ANTI_BAN_CONFIG = RATE_LIMITS;
