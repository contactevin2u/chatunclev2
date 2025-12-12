import { sleep, randomDelay } from '@chatuncle/shared';
import { RATE_LIMITS, DAILY_LIMITS_BY_AGE } from '../../config/constants.js';

/**
 * Anti-ban service for WhatsApp
 * Implements rate limiting and human-like behavior patterns
 */
export class AntiBanService {
  private accountId: string;

  // Per-contact rate limiting
  private lastMessageToContact = new Map<string, number>();

  // Overall rate limiting
  private recentMessages: number[] = [];

  // Batch tracking
  private batchMessageCount = 0;
  private lastBatchReset = Date.now();

  // New contact tracking
  private newContactsToday = new Set<string>();
  private knownContacts = new Set<string>();
  private newContactDayStart = this.getStartOfDay();

  // Account info (should be set from database)
  private accountCreatedAt: Date = new Date();

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Set account creation date for daily limit calculation
   */
  setAccountCreatedAt(date: Date): void {
    this.accountCreatedAt = date;
  }

  /**
   * Mark a contact as known (existing contact)
   */
  addKnownContact(contactId: string): void {
    this.knownContacts.add(contactId);
  }

  /**
   * Wait for rate limit before sending
   * @param contactId - Target contact
   * @returns true if can proceed, false if blocked
   */
  async waitForRateLimit(contactId: string): Promise<boolean> {
    // Reset daily tracking if new day
    this.resetDailyTrackingIfNeeded();

    // Check if new contact and within daily limit
    if (!this.knownContacts.has(contactId)) {
      const canSend = this.canSendToNewContact();
      if (!canSend) {
        console.warn(`[AntiBan] Daily new contact limit reached for ${this.accountId}`);
        return false;
      }
      this.newContactsToday.add(contactId);
    }

    // Check same-contact rate limit
    const lastMessage = this.lastMessageToContact.get(contactId);
    if (lastMessage) {
      const elapsed = Date.now() - lastMessage;
      if (elapsed < RATE_LIMITS.MIN_SAME_CONTACT_DELAY_MS) {
        const waitTime = RATE_LIMITS.MIN_SAME_CONTACT_DELAY_MS - elapsed;
        console.log(`[AntiBan] Waiting ${waitTime}ms for same-contact limit`);
        await sleep(waitTime);
      }
    }

    // Check messages-per-minute limit
    await this.waitForMinuteRateLimit();

    // Check batch cooldown
    await this.checkBatchCooldown();

    // Record this message
    this.lastMessageToContact.set(contactId, Date.now());
    this.recentMessages.push(Date.now());
    this.batchMessageCount++;

    return true;
  }

  /**
   * Get delay for reply mode (conversational)
   */
  getReplyDelay(): number {
    return randomDelay(RATE_LIMITS.REPLY_MIN_DELAY_MS, RATE_LIMITS.REPLY_MAX_DELAY_MS);
  }

  /**
   * Get delay for bulk mode (scheduled/broadcast)
   */
  getBulkDelay(): number {
    return randomDelay(RATE_LIMITS.BULK_MIN_DELAY_MS, RATE_LIMITS.BULK_MAX_DELAY_MS);
  }

  /**
   * Get typing duration based on message length
   */
  getTypingDuration(messageLength: number): number {
    // ~80ms per character + random variation
    const baseTime = Math.min(messageLength * 80, RATE_LIMITS.MAX_TYPING_MS);
    return Math.max(
      RATE_LIMITS.MIN_TYPING_MS,
      baseTime + randomDelay(0, 500)
    );
  }

  /**
   * Check if we can send to a new contact today
   */
  private canSendToNewContact(): boolean {
    const accountAgeDays = this.getAccountAgeDays();
    const limit = this.getDailyNewContactLimit(accountAgeDays);
    return this.newContactsToday.size < limit;
  }

  /**
   * Get account age in days
   */
  private getAccountAgeDays(): number {
    return Math.floor(
      (Date.now() - this.accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  /**
   * Get daily new contact limit based on account age
   */
  private getDailyNewContactLimit(ageDays: number): number {
    for (const limit of DAILY_LIMITS_BY_AGE) {
      if (ageDays <= limit.ageDays) {
        return limit.maxNewContacts;
      }
    }
    return 1000; // Default max
  }

  /**
   * Wait for messages-per-minute rate limit
   */
  private async waitForMinuteRateLimit(): Promise<void> {
    const oneMinuteAgo = Date.now() - 60000;
    this.recentMessages = this.recentMessages.filter(t => t > oneMinuteAgo);

    if (this.recentMessages.length >= RATE_LIMITS.MESSAGES_PER_MINUTE) {
      const oldestInWindow = this.recentMessages[0]!;
      const waitTime = 60000 - (Date.now() - oldestInWindow) + 100; // +100ms buffer
      if (waitTime > 0) {
        console.log(`[AntiBan] Waiting ${waitTime}ms for minute rate limit`);
        await sleep(waitTime);
      }
    }
  }

  /**
   * Check and apply batch cooldown
   */
  private async checkBatchCooldown(): Promise<void> {
    // Reset batch count every 5 minutes
    if (Date.now() - this.lastBatchReset > RATE_LIMITS.BATCH_COOLDOWN_MS) {
      this.batchMessageCount = 0;
      this.lastBatchReset = Date.now();
    }

    // If batch limit reached, wait for cooldown
    if (this.batchMessageCount >= RATE_LIMITS.BATCH_SIZE_BEFORE_COOLDOWN) {
      const waitTime = RATE_LIMITS.BATCH_COOLDOWN_MS - (Date.now() - this.lastBatchReset);
      if (waitTime > 0) {
        console.log(`[AntiBan] Batch cooldown: waiting ${Math.ceil(waitTime / 1000)}s`);
        await sleep(waitTime);
        this.batchMessageCount = 0;
        this.lastBatchReset = Date.now();
      }
    }
  }

  /**
   * Reset daily tracking if it's a new day
   */
  private resetDailyTrackingIfNeeded(): void {
    const today = this.getStartOfDay();
    if (today > this.newContactDayStart) {
      this.newContactsToday.clear();
      this.newContactDayStart = today;
      console.log(`[AntiBan] Reset daily new contact tracking`);
    }
  }

  /**
   * Get start of current day (midnight)
   */
  private getStartOfDay(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  /**
   * Get current rate limit stats
   */
  getStats(): {
    messagesThisMinute: number;
    batchCount: number;
    newContactsToday: number;
    dailyLimit: number;
  } {
    const oneMinuteAgo = Date.now() - 60000;
    return {
      messagesThisMinute: this.recentMessages.filter(t => t > oneMinuteAgo).length,
      batchCount: this.batchMessageCount,
      newContactsToday: this.newContactsToday.size,
      dailyLimit: this.getDailyNewContactLimit(this.getAccountAgeDays()),
    };
  }
}
