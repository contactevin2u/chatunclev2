import { LRUCache } from 'lru-cache';
import { DEDUP_CONFIG } from '../config/constants.js';
import { batchCheckMessagesExist } from '../db/batch-operations.js';

/**
 * 3-Layer Message Deduplication Service
 *
 * Layer 1: Memory (Fast, in-process)
 * - LRU Cache with 150,000 entries
 * - 2-hour TTL
 * - O(1) lookup
 *
 * Layer 2: Database (Persistent, after restart)
 * - PostgreSQL check on channel_message_id
 * - Bulk check support for batch operations
 * - Results cached to avoid repeated queries
 *
 * Layer 3: Frontend (Client-side)
 * - Message Map by ID
 * - Pending message tracking (optimistic UI)
 * - tempId → realId mapping
 */
export class MessageDeduplicator {
  // Layer 1: Memory cache
  private memoryCache: LRUCache<string, number>;

  // Layer 2: DB check cache (avoid repeated queries for non-existent messages)
  private dbCheckCache: LRUCache<string, boolean>;

  // Stats
  private stats = {
    memoryHits: 0,
    memoryMisses: 0,
    dbHits: 0,
    dbMisses: 0,
    totalChecks: 0,
  };

  constructor() {
    // Layer 1: Memory LRU cache
    this.memoryCache = new LRUCache<string, number>({
      max: DEDUP_CONFIG.MEMORY_MAX_ENTRIES,
      ttl: DEDUP_CONFIG.MEMORY_TTL_MS,
    });

    // Layer 2: DB check cache (negative results)
    this.dbCheckCache = new LRUCache<string, boolean>({
      max: 50000, // Cache recent DB checks
      ttl: DEDUP_CONFIG.DB_CHECK_CACHE_TTL_MS,
    });

    console.log('[Dedup] Initialized with config:', {
      memoryMaxEntries: DEDUP_CONFIG.MEMORY_MAX_ENTRIES,
      memoryTtlMs: DEDUP_CONFIG.MEMORY_TTL_MS,
    });
  }

  /**
   * Generate cache key for a message
   */
  private getKey(accountId: string, channelMessageId: string): string {
    return `${accountId}:${channelMessageId}`;
  }

  /**
   * Check if message is in memory cache
   */
  private isInMemory(key: string): boolean {
    return this.memoryCache.has(key);
  }

  /**
   * Mark message in memory cache
   */
  private markInMemory(key: string): void {
    this.memoryCache.set(key, Date.now());
  }

  /**
   * Check if message exists in database
   */
  private async isInDatabase(channelMessageId: string): Promise<boolean> {
    // Check DB cache first
    const cacheKey = `db:${channelMessageId}`;
    const cached = this.dbCheckCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Query database
    const existing = await batchCheckMessagesExist([channelMessageId]);
    const exists = existing.has(channelMessageId);

    // Cache the result
    this.dbCheckCache.set(cacheKey, exists);

    return exists;
  }

  /**
   * Check if message is duplicate and mark it
   * Returns true if DUPLICATE (skip processing)
   * Returns false if NEW (process the message)
   */
  async checkAndMark(accountId: string, channelMessageId: string): Promise<boolean> {
    this.stats.totalChecks++;
    const key = this.getKey(accountId, channelMessageId);

    // Layer 1: Memory check (fast)
    if (this.isInMemory(key)) {
      this.stats.memoryHits++;
      return true; // Duplicate
    }
    this.stats.memoryMisses++;

    // Layer 2: Database check (after server restart)
    const inDb = await this.isInDatabase(channelMessageId);
    if (inDb) {
      this.stats.dbHits++;
      this.markInMemory(key); // Cache for next time
      return true; // Duplicate
    }
    this.stats.dbMisses++;

    // New message - mark and return false
    this.markInMemory(key);
    return false;
  }

  /**
   * Bulk filter - returns only NEW message IDs
   * Used for batch processing (history sync)
   */
  async filterNew(
    accountId: string,
    channelMessageIds: string[]
  ): Promise<string[]> {
    if (channelMessageIds.length === 0) return [];

    // Memory filter first (fast)
    const notInMemory = channelMessageIds.filter(
      id => !this.isInMemory(this.getKey(accountId, id))
    );

    if (notInMemory.length === 0) return [];

    // Bulk DB check
    const existingInDb = await batchCheckMessagesExist(notInMemory);

    // Mark found ones in memory
    for (const id of existingInDb) {
      this.markInMemory(this.getKey(accountId, id));
    }

    // Return only truly new ones
    const newIds = notInMemory.filter(id => !existingInDb.has(id));

    // Pre-mark new ones in memory (they will be inserted)
    for (const id of newIds) {
      this.markInMemory(this.getKey(accountId, id));
    }

    return newIds;
  }

  /**
   * Pre-mark a message ID (before insertion)
   * Used when we know we're about to insert a message
   */
  preMark(accountId: string, channelMessageId: string): void {
    this.markInMemory(this.getKey(accountId, channelMessageId));
  }

  /**
   * Clear memory cache for an account (on disconnect)
   */
  clearAccount(accountId: string): void {
    // LRU cache doesn't support prefix deletion
    // For now, we just let TTL handle cleanup
    console.log(`[Dedup] Clear account ${accountId} (handled by TTL)`);
  }

  /**
   * Get deduplication statistics
   */
  getStats(): {
    memorySize: number;
    memoryHitRate: number;
    dbHitRate: number;
    totalChecks: number;
  } {
    const totalMemoryChecks = this.stats.memoryHits + this.stats.memoryMisses;
    const totalDbChecks = this.stats.dbHits + this.stats.dbMisses;

    return {
      memorySize: this.memoryCache.size,
      memoryHitRate: totalMemoryChecks > 0
        ? this.stats.memoryHits / totalMemoryChecks
        : 0,
      dbHitRate: totalDbChecks > 0
        ? this.stats.dbHits / totalDbChecks
        : 0,
      totalChecks: this.stats.totalChecks,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      dbHits: 0,
      dbMisses: 0,
      totalChecks: 0,
    };
  }
}

// Singleton instance
let deduplicator: MessageDeduplicator | null = null;

export function getDeduplicator(): MessageDeduplicator {
  if (!deduplicator) {
    deduplicator = new MessageDeduplicator();
  }
  return deduplicator;
}
