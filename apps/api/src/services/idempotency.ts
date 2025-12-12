import { createHash } from 'crypto';
import { eq, and, lt } from 'drizzle-orm';
import { IDEMPOTENCY_CONFIG } from '@chatuncle/shared';
import { db } from '../db/index.js';
import { idempotencyKeys } from '../db/schema.js';

/**
 * Result of an idempotency check
 */
export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  cachedResponse?: unknown;
}

/**
 * Idempotency service for request deduplication
 *
 * Features:
 * - 24-hour idempotency window
 * - Request hash verification (ensures same params)
 * - Automatic cleanup of expired keys
 */
export class IdempotencyService {
  /**
   * Hash request parameters for duplicate detection
   */
  static hashRequest(params: object): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Validate idempotency key format
   */
  static validateKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    if (key.length > IDEMPOTENCY_CONFIG.MAX_KEY_LENGTH) {
      return false;
    }
    // Allow alphanumeric, dashes, and underscores
    return /^[a-zA-Z0-9_-]+$/.test(key);
  }

  /**
   * Check if a request is a duplicate
   *
   * @param accountId - The account making the request
   * @param key - The idempotency key
   * @param requestParams - The request parameters (for hash verification)
   */
  async check(
    accountId: string,
    key: string,
    requestParams: object
  ): Promise<IdempotencyCheckResult> {
    if (!IdempotencyService.validateKey(key)) {
      return { isDuplicate: false };
    }

    const requestHash = IdempotencyService.hashRequest(requestParams);

    // Look up existing key
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.accountId, accountId),
          eq(idempotencyKeys.idempotencyKey, key)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return { isDuplicate: false };
    }

    const record = existing[0];

    // Check if expired
    if (new Date() > record.expiresAt) {
      // Clean up expired record
      await this.delete(accountId, key);
      return { isDuplicate: false };
    }

    // Verify request hash matches
    if (record.requestHash !== requestHash) {
      // Same key but different params - this is an error condition
      // Return cached response but log the mismatch
      console.warn(
        `[Idempotency] Key ${key} reused with different params for account ${accountId}`
      );
    }

    return {
      isDuplicate: true,
      cachedResponse: record.response,
    };
  }

  /**
   * Store an idempotency key with response
   *
   * @param accountId - The account making the request
   * @param key - The idempotency key
   * @param requestParams - The request parameters
   * @param response - The response to cache
   */
  async store(
    accountId: string,
    key: string,
    requestParams: object,
    response: unknown
  ): Promise<void> {
    if (!IdempotencyService.validateKey(key)) {
      return;
    }

    const requestHash = IdempotencyService.hashRequest(requestParams);
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_CONFIG.TTL_MS);

    await db
      .insert(idempotencyKeys)
      .values({
        accountId,
        idempotencyKey: key,
        requestHash,
        response,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKeys.accountId, idempotencyKeys.idempotencyKey],
        set: {
          requestHash,
          response,
          expiresAt,
        },
      });
  }

  /**
   * Delete an idempotency key
   */
  async delete(accountId: string, key: string): Promise<void> {
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.accountId, accountId),
          eq(idempotencyKeys.idempotencyKey, key)
        )
      );
  }

  /**
   * Clean up expired idempotency keys
   *
   * Should be run periodically (e.g., hourly)
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();

    const result = await db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, now));

    // Note: drizzle doesn't return deleted count directly
    // We'd need to count before or use raw SQL
    console.log('[Idempotency] Cleaned up expired keys');
    return 0; // Placeholder
  }

  /**
   * Get key stats for an account (for debugging)
   */
  async getStats(accountId: string): Promise<{
    totalKeys: number;
    expiringSoon: number;
  }> {
    const allKeys = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.accountId, accountId));

    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 3600000); // 1 hour

    const expiringSoon = allKeys.filter(
      k => k.expiresAt > now && k.expiresAt <= soonThreshold
    );

    return {
      totalKeys: allKeys.length,
      expiringSoon: expiringSoon.length,
    };
  }
}

// Singleton instance
export const idempotencyService = new IdempotencyService();
