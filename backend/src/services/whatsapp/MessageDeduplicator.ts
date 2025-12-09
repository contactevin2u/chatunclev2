/**
 * Message Deduplicator Service
 *
 * Prevents duplicate message processing which can happen during:
 * - Session reconnects
 * - History sync overlaps
 * - Network issues causing retransmissions
 *
 * Uses in-memory LRU cache with automatic cleanup.
 */

class MessageDeduplicatorService {
  // Map of messageId -> timestamp (when it was processed)
  private processed: Map<string, number> = new Map();

  // Maximum entries before forced cleanup
  private maxEntries = 50000;

  // TTL for processed entries (1 hour)
  private ttlMs = 3600000;

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000); // Every 5 minutes
  }

  /**
   * Generate a unique key for a message
   */
  private getKey(accountId: string, messageId: string): string {
    return `${accountId}:${messageId}`;
  }

  /**
   * Check if a message has already been processed
   */
  isProcessed(accountId: string, messageId: string): boolean {
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
   * Mark a message as processed
   */
  markProcessed(accountId: string, messageId: string): void {
    if (!messageId) return;
    const key = this.getKey(accountId, messageId);
    this.processed.set(key, Date.now());

    // Trigger cleanup if too many entries
    if (this.processed.size > this.maxEntries) {
      this.cleanup();
    }
  }

  /**
   * Check and mark in one atomic operation
   * Returns true if message was already processed (should skip)
   * Returns false if message is new (should process)
   */
  checkAndMark(accountId: string, messageId: string): boolean {
    if (this.isProcessed(accountId, messageId)) {
      return true; // Already processed, skip
    }
    this.markProcessed(accountId, messageId);
    return false; // New message, process it
  }

  /**
   * Bulk check for multiple messages
   * Returns array of messageIds that are NEW (not yet processed)
   */
  filterNew(accountId: string, messageIds: string[]): string[] {
    return messageIds.filter(id => !this.isProcessed(accountId, id));
  }

  /**
   * Bulk mark multiple messages as processed
   */
  markProcessedBatch(accountId: string, messageIds: string[]): void {
    const now = Date.now();
    for (const id of messageIds) {
      if (id) {
        this.processed.set(this.getKey(accountId, id), now);
      }
    }
  }

  /**
   * Remove old entries to prevent memory bloat
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, timestamp] of this.processed) {
      if (now - timestamp > this.ttlMs) {
        this.processed.delete(key);
        removed++;
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

    console.log(`[MessageDedup] Cleared ${removed} entries for account ${accountId}`);
  }

  /**
   * Get statistics
   */
  getStats(): { totalEntries: number; oldestEntryAge: number } {
    let oldestTimestamp = Date.now();

    for (const timestamp of this.processed.values()) {
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
      }
    }

    return {
      totalEntries: this.processed.size,
      oldestEntryAge: Date.now() - oldestTimestamp,
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
    console.log('[MessageDedup] Shutdown complete');
  }
}

// Singleton instance
export const messageDeduplicator = new MessageDeduplicatorService();
