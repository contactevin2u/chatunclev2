/**
 * Message Deduplicator Service
 *
 * Prevents duplicate message processing which can happen during:
 * - Session reconnects
 * - History sync overlaps
 * - Network issues causing retransmissions
 * - Server restarts (now with DB fallback)
 *
 * Uses in-memory LRU cache with automatic cleanup and DB fallback.
 */

import { queryOne } from '../../config/database';

class MessageDeduplicatorService {
  // Map of messageId -> timestamp (when it was processed)
  private processed: Map<string, number> = new Map();

  // OPTIMIZED FOR 2GB RAM
  // Maximum entries before forced cleanup
  private maxEntries = 150000;

  // TTL for processed entries (2 hours - matches MessageStore TTL)
  private ttlMs = 7200000;

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Track recent DB checks to avoid repeated queries
  private recentDbChecks: Map<string, number> = new Map();
  private dbCheckTtlMs = 300000; // 5 minutes

  constructor() {
    // Start periodic cleanup (every 3 minutes for faster cleanup)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 180000); // Every 3 minutes
  }

  /**
   * Generate a unique key for a message
   */
  private getKey(accountId: string, messageId: string): string {
    return `${accountId}:${messageId}`;
  }

  /**
   * Check if a message has already been processed (memory only)
   */
  isProcessedInMemory(accountId: string, messageId: string): boolean {
    if (!messageId) return false;
    const key = this.getKey(accountId, messageId);
    const timestamp = this.processed.get(key);

    if (!timestamp) return false;

    // Check if entry has expired
    if (Date.now() - timestamp > this.ttlMs) {
      this.processed.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if a message exists in database (fallback after server restart)
   * Uses a short-term cache to avoid repeated DB queries
   */
  async isProcessedInDb(accountId: string, messageId: string): Promise<boolean> {
    if (!messageId) return false;

    const key = this.getKey(accountId, messageId);

    // Check if we recently queried this
    const recentCheck = this.recentDbChecks.get(key);
    if (recentCheck && Date.now() - recentCheck < this.dbCheckTtlMs) {
      return false; // Already checked recently, not in DB
    }

    try {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM messages WHERE wa_message_id = $1 LIMIT 1`,
        [messageId]
      );

      if (existing) {
        // Found in DB, mark as processed in memory too
        this.markProcessed(accountId, messageId);
        return true;
      }

      // Not found, cache the check to avoid repeated queries
      this.recentDbChecks.set(key, Date.now());
      return false;
    } catch (error) {
      // On DB error, assume not processed to avoid data loss
      console.error('[MessageDedup] DB check error:', error);
      return false;
    }
  }

  /**
   * Check if message is processed (memory first, then DB fallback)
   * Use this for critical deduplication after server restart
   */
  async isProcessed(accountId: string, messageId: string): Promise<boolean> {
    // Fast path: check memory first
    if (this.isProcessedInMemory(accountId, messageId)) {
      return true;
    }

    // Slow path: check database (only if not in memory)
    return await this.isProcessedInDb(accountId, messageId);
  }

  /**
   * Synchronous check (memory only) - use for batch processing
   */
  isProcessedSync(accountId: string, messageId: string): boolean {
    return this.isProcessedInMemory(accountId, messageId);
  }

  /**
   * Mark a message as processed
   */
  markProcessed(accountId: string, messageId: string): void {
    if (!messageId) return;
    const key = this.getKey(accountId, messageId);
    this.processed.set(key, Date.now());

    // Clear from recent DB checks since we now have it in memory
    this.recentDbChecks.delete(key);

    // Trigger cleanup if too many entries
    if (this.processed.size > this.maxEntries) {
      this.cleanup();
    }
  }

  /**
   * Check and mark in one atomic operation (async with DB fallback)
   * Returns true if message was already processed (should skip)
   * Returns false if message is new (should process)
   */
  async checkAndMark(accountId: string, messageId: string): Promise<boolean> {
    if (await this.isProcessed(accountId, messageId)) {
      return true; // Already processed, skip
    }
    this.markProcessed(accountId, messageId);
    return false; // New message, process it
  }

  /**
   * Synchronous check and mark (memory only) - use for batch processing
   * Returns true if message was already processed (should skip)
   * Returns false if message is new (should process)
   */
  checkAndMarkSync(accountId: string, messageId: string): boolean {
    if (this.isProcessedSync(accountId, messageId)) {
      return true; // Already processed, skip
    }
    this.markProcessed(accountId, messageId);
    return false; // New message, process it
  }

  /**
   * Bulk check for multiple messages (memory only for speed)
   * Returns array of messageIds that are NEW (not yet processed)
   */
  filterNew(accountId: string, messageIds: string[]): string[] {
    return messageIds.filter(id => !this.isProcessedSync(accountId, id));
  }

  /**
   * Bulk check with DB fallback for critical operations
   * Returns array of messageIds that are NEW (not in memory or DB)
   */
  async filterNewWithDbCheck(accountId: string, messageIds: string[]): Promise<string[]> {
    // First filter by memory
    const memoryFiltered = messageIds.filter(id => !this.isProcessedSync(accountId, id));

    if (memoryFiltered.length === 0) {
      return [];
    }

    // Then check DB for remaining ones (batch query)
    try {
      const placeholders = memoryFiltered.map((_, i) => `$${i + 1}`).join(',');
      const { query } = await import('../../config/database');
      const existing = await query<{ wa_message_id: string }>(
        `SELECT wa_message_id FROM messages WHERE wa_message_id IN (${placeholders})`,
        memoryFiltered
      );

      const existingIds = new Set(existing.map(e => e.wa_message_id));

      // Mark found ones as processed
      existing.forEach(e => {
        this.markProcessed(accountId, e.wa_message_id);
      });

      return memoryFiltered.filter(id => !existingIds.has(id));
    } catch (error) {
      console.error('[MessageDedup] Bulk DB check error:', error);
      return memoryFiltered; // On error, return all to avoid data loss
    }
  }

  /**
   * Bulk mark multiple messages as processed
   */
  markProcessedBatch(accountId: string, messageIds: string[]): void {
    const now = Date.now();
    for (const id of messageIds) {
      if (id) {
        const key = this.getKey(accountId, id);
        this.processed.set(key, now);
        this.recentDbChecks.delete(key);
      }
    }
  }

  /**
   * Remove old entries to prevent memory bloat
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    // Cleanup processed entries
    for (const [key, timestamp] of this.processed) {
      if (now - timestamp > this.ttlMs) {
        this.processed.delete(key);
        removed++;
      }
    }

    // Cleanup recent DB checks
    for (const [key, timestamp] of this.recentDbChecks) {
      if (now - timestamp > this.dbCheckTtlMs) {
        this.recentDbChecks.delete(key);
      }
    }

    // If still too many, remove oldest entries
    if (this.processed.size > this.maxEntries) {
      const entries = Array.from(this.processed.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending

      const toRemove = entries.slice(0, entries.length - (this.maxEntries / 2));
      for (const [key] of toRemove) {
        this.processed.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[MessageDedup] Cleaned up ${removed} entries, ${this.processed.size} remaining`);
    }
  }

  /**
   * Clear all entries for an account (on disconnect/delete)
   */
  clearAccount(accountId: string): void {
    const prefix = `${accountId}:`;
    let removed = 0;

    for (const key of this.processed.keys()) {
      if (key.startsWith(prefix)) {
        this.processed.delete(key);
        removed++;
      }
    }

    for (const key of this.recentDbChecks.keys()) {
      if (key.startsWith(prefix)) {
        this.recentDbChecks.delete(key);
      }
    }

    console.log(`[MessageDedup] Cleared ${removed} entries for account ${accountId}`);
  }

  /**
   * Get statistics
   */
  getStats(): { totalEntries: number; oldestEntryAge: number; dbChecksCached: number } {
    let oldestTimestamp = Date.now();

    for (const timestamp of this.processed.values()) {
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
      }
    }

    return {
      totalEntries: this.processed.size,
      oldestEntryAge: Date.now() - oldestTimestamp,
      dbChecksCached: this.recentDbChecks.size,
    };
  }

  /**
   * Shutdown cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.processed.clear();
    this.recentDbChecks.clear();
    console.log('[MessageDedup] Shutdown complete');
  }
}

// Singleton instance
export const messageDeduplicator = new MessageDeduplicatorService();
