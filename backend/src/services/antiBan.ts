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
const RATE_LIMITS = {
  // Messages per minute (conservative: 6-12 recommended)
  MESSAGES_PER_MINUTE: 8,

  // Minimum delay between messages in ms (1-3 seconds)
  MIN_DELAY_MS: 1000,

  // Maximum delay between messages in ms (5-15 seconds)
  MAX_DELAY_MS: 8000,

  // Typing indicator duration before sending (1-4 seconds)
  MIN_TYPING_MS: 1000,
  MAX_TYPING_MS: 4000,

  // Cooldown between batches in ms (10 minutes)
  BATCH_COOLDOWN_MS: 10 * 60 * 1000,

  // Maximum messages per batch
  BATCH_SIZE: 30,

  // Daily limits based on account age (days)
  DAILY_LIMITS: {
    0: 20,    // Day 0-1: max 20 new contacts
    1: 30,    // Day 1-3: max 30 new contacts
    3: 50,    // Day 3-7: max 50 new contacts
    7: 100,   // Day 7-14: max 100 new contacts
    14: 200,  // Day 14-30: max 200 new contacts
    30: 500,  // Day 30+: max 500 new contacts
  } as Record<number, number>,

  // Warm-up period in days (highest risk period)
  WARMUP_PERIOD_DAYS: 10,
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
 */
export function getTypingDuration(messageLength: number = 50): number {
  // Base typing time + time based on message length (simulating typing speed)
  const baseTime = RATE_LIMITS.MIN_TYPING_MS;
  const lengthTime = Math.min(messageLength * 30, RATE_LIMITS.MAX_TYPING_MS - baseTime);
  const randomVariation = Math.floor(Math.random() * 1000);

  return baseTime + lengthTime + randomVariation;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get account age in days from creation date
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
 * Wait for rate limit with random human-like delay
 * Call this before sending any message
 */
export async function waitForRateLimit(accountId: string): Promise<void> {
  // Check rate limit
  let check = await canSendMessage(accountId);

  while (!check.allowed) {
    console.log(`[AntiBan] Rate limit active for ${accountId}, waiting ${check.waitMs}ms. Reason: ${check.reason}`);
    await sleep(check.waitMs + getRandomDelay(500, 2000)); // Add random buffer
    check = await canSendMessage(accountId);
  }

  // Add additional random delay for human-like behavior
  const randomDelay = getRandomDelay();
  console.log(`[AntiBan] Adding human-like delay: ${randomDelay}ms`);
  await sleep(randomDelay);
}

/**
 * Check if contact has been messaged before (for new contact tracking)
 */
export async function hasMessagedContactBefore(accountId: string, contactWaId: string): Promise<boolean> {
  const existing = await queryOne(`
    SELECT 1 FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.whatsapp_account_id = $1 AND ct.wa_id = $2 AND m.sender_type = 'agent'
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
  // Check if new contact and within limits
  if (!options.skipNewContactCheck) {
    const hasMessaged = await hasMessagedContactBefore(accountId, contactWaId);

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
  const hasMessaged = await hasMessagedContactBefore(accountId, contactWaId);
  recordMessageSent(accountId, !hasMessaged);
  recordBatchMessage(accountId);
}

// Export configuration for reference
export const ANTI_BAN_CONFIG = RATE_LIMITS;
