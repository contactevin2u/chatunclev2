import { eq, and, lt, isNull, inArray } from 'drizzle-orm';
import { VALIDITY_CONFIG, ERROR_CODES } from '@chatuncle/shared';
import { db } from '../db/index.js';
import { messages, conversations } from '../db/schema.js';
import { webhookService } from './webhooks.js';

/**
 * Message validity service for Twilio-like message expiration
 *
 * Features:
 * - Default 4 hour validity period
 * - Maximum 10 hour validity period
 * - Automatic expiration of queued messages
 * - Webhook notification on expiration
 */
export class MessageValidityService {
  /**
   * Calculate expiration timestamp
   *
   * @param validityPeriodSeconds - Validity period in seconds
   * @returns Expiration date
   */
  calculateExpiry(validityPeriodSeconds?: number): Date {
    // Validate and clamp validity period
    let period = validityPeriodSeconds ?? VALIDITY_CONFIG.DEFAULT_SECONDS;
    period = Math.max(VALIDITY_CONFIG.MIN_SECONDS, period);
    period = Math.min(VALIDITY_CONFIG.MAX_SECONDS, period);

    return new Date(Date.now() + period * 1000);
  }

  /**
   * Validate validity period
   *
   * @param validityPeriodSeconds - Validity period to validate
   * @returns Validated period or error
   */
  validatePeriod(validityPeriodSeconds?: number): {
    valid: boolean;
    normalizedPeriod: number;
    error?: string;
  } {
    if (validityPeriodSeconds === undefined) {
      return {
        valid: true,
        normalizedPeriod: VALIDITY_CONFIG.DEFAULT_SECONDS,
      };
    }

    if (typeof validityPeriodSeconds !== 'number' || isNaN(validityPeriodSeconds)) {
      return {
        valid: false,
        normalizedPeriod: VALIDITY_CONFIG.DEFAULT_SECONDS,
        error: 'Validity period must be a number',
      };
    }

    if (validityPeriodSeconds < VALIDITY_CONFIG.MIN_SECONDS) {
      return {
        valid: false,
        normalizedPeriod: VALIDITY_CONFIG.MIN_SECONDS,
        error: `Validity period must be at least ${VALIDITY_CONFIG.MIN_SECONDS} seconds`,
      };
    }

    if (validityPeriodSeconds > VALIDITY_CONFIG.MAX_SECONDS) {
      return {
        valid: false,
        normalizedPeriod: VALIDITY_CONFIG.MAX_SECONDS,
        error: `Validity period cannot exceed ${VALIDITY_CONFIG.MAX_SECONDS} seconds (10 hours)`,
      };
    }

    return {
      valid: true,
      normalizedPeriod: validityPeriodSeconds,
    };
  }

  /**
   * Process expired messages
   *
   * Should be run periodically (e.g., every minute)
   */
  async processExpiredMessages(): Promise<number> {
    const now = new Date();

    // Find messages that:
    // 1. Have an expiration time
    // 2. Are past expiration
    // 3. Are still in pending or queued status
    const expiredMessages = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        channelMessageId: messages.channelMessageId,
      })
      .from(messages)
      .where(
        and(
          lt(messages.expiresAt, now),
          inArray(messages.status, ['pending', 'queued'])
        )
      )
      .limit(100); // Process in batches

    if (expiredMessages.length === 0) {
      return 0;
    }

    console.log(`[Validity] Processing ${expiredMessages.length} expired messages`);

    // Expire each message
    for (const msg of expiredMessages) {
      await this.expireMessage(msg.id, msg.conversationId, msg.channelMessageId);
    }

    return expiredMessages.length;
  }

  /**
   * Expire a single message
   */
  async expireMessage(
    messageId: string,
    conversationId: string,
    channelMessageId: string
  ): Promise<void> {
    const errorCode = ERROR_CODES.MESSAGE_EXPIRED;

    // Update message status
    await db
      .update(messages)
      .set({
        status: 'failed',
        errorCode: errorCode.code,
        errorMessage: errorCode.description,
      })
      .where(eq(messages.id, messageId));

    // Get account ID for webhook
    const convResult = await db
      .select({ accountId: conversations.accountId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (convResult.length > 0) {
      // Queue webhook notification
      await webhookService.queueWebhook(convResult[0].accountId, 'message.expired', {
        messageSid: messageId,
        channelMessageId,
        conversationId,
        status: 'failed',
        errorCode: errorCode.code,
        errorMessage: errorCode.description,
        expiredAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Check if a message is expired
   */
  async isExpired(messageId: string): Promise<boolean> {
    const result = await db
      .select({
        expiresAt: messages.expiresAt,
        status: messages.status,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (result.length === 0) {
      return true; // Message not found, treat as expired
    }

    const msg = result[0];

    // Already delivered or failed
    if (['delivered', 'read', 'failed'].includes(msg.status)) {
      return false;
    }

    // Check expiration
    if (msg.expiresAt && new Date() > msg.expiresAt) {
      return true;
    }

    return false;
  }

  /**
   * Extend message validity (for retries)
   *
   * @param messageId - Message ID
   * @param additionalSeconds - Additional seconds to add
   */
  async extendValidity(messageId: string, additionalSeconds: number): Promise<Date | null> {
    const result = await db
      .select({ expiresAt: messages.expiresAt })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (result.length === 0 || !result[0].expiresAt) {
      return null;
    }

    const currentExpiry = result[0].expiresAt;
    const newExpiry = new Date(currentExpiry.getTime() + additionalSeconds * 1000);

    // Don't extend beyond max validity from original creation
    // (In a full implementation, we'd track original creation time)

    await db
      .update(messages)
      .set({ expiresAt: newExpiry })
      .where(eq(messages.id, messageId));

    return newExpiry;
  }

  /**
   * Get messages expiring soon
   *
   * @param accountId - Account to check
   * @param windowSeconds - Time window to check (default 5 minutes)
   */
  async getExpiringSoon(accountId: string, windowSeconds: number = 300) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowSeconds * 1000);

    return db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        expiresAt: messages.expiresAt,
        status: messages.status,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.accountId, accountId),
          lt(messages.expiresAt, windowEnd),
          inArray(messages.status, ['pending', 'queued'])
        )
      )
      .limit(100);
  }
}

// Singleton instance
export const validityService = new MessageValidityService();
