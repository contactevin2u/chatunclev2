/**
 * Group Metadata Cache for Baileys
 *
 * Caches group metadata (participants, subject, description, etc.)
 * to reduce API calls to WhatsApp servers.
 *
 * As recommended by Baileys docs:
 * "If you use Baileys for groups, it's recommended to set `cachedGroupMetadata`
 * in socket config using a cache like NodeCache with a 5-minute TTL."
 *
 * Benefits:
 * - Reduces group metadata fetch requests (ban risk reduction)
 * - Faster group operations (send to group, get participants)
 * - Less load on WhatsApp servers
 */

import NodeCache from 'node-cache';
import { GroupMetadata } from '@whiskeysockets/baileys';

class GroupMetadataCacheService {
  // Per-account caches (5 minute TTL as recommended)
  private caches: Map<string, NodeCache> = new Map();

  // Default TTL in seconds
  private defaultTTL = 300; // 5 minutes

  /**
   * Get or create cache for an account
   */
  private getCache(accountId: string): NodeCache {
    if (!this.caches.has(accountId)) {
      const cache = new NodeCache({
        stdTTL: this.defaultTTL,
        checkperiod: 60,       // Check for expired every minute
        useClones: false,      // Don't clone for performance
        maxKeys: 500,          // Max 500 groups per account
      });

      this.caches.set(accountId, cache);
    }
    return this.caches.get(accountId)!;
  }

  /**
   * Store group metadata in cache
   */
  set(accountId: string, groupJid: string, metadata: GroupMetadata): void {
    const cache = this.getCache(accountId);
    cache.set(groupJid, metadata);
  }

  /**
   * Get group metadata from cache
   */
  get(accountId: string, groupJid: string): GroupMetadata | undefined {
    const cache = this.getCache(accountId);
    return cache.get<GroupMetadata>(groupJid);
  }

  /**
   * Check if group metadata is cached
   */
  has(accountId: string, groupJid: string): boolean {
    const cache = this.getCache(accountId);
    return cache.has(groupJid);
  }

  /**
   * Delete group metadata from cache
   */
  delete(accountId: string, groupJid: string): void {
    const cache = this.getCache(accountId);
    cache.del(groupJid);
  }

  /**
   * Update group metadata (partial update)
   */
  update(accountId: string, groupJid: string, updates: Partial<GroupMetadata>): void {
    const existing = this.get(accountId, groupJid);
    if (existing) {
      this.set(accountId, groupJid, { ...existing, ...updates });
    }
  }

  /**
   * Create cachedGroupMetadata function for Baileys socket config
   * This is the function Baileys expects in the socket configuration
   */
  createCacheFunction(accountId: string): (jid: string) => Promise<GroupMetadata | undefined> {
    return async (jid: string): Promise<GroupMetadata | undefined> => {
      const cached = this.get(accountId, jid);
      if (cached) {
        console.log(`[GroupCache] Hit for ${jid.split('@')[0]}`);
        return cached;
      }
      console.log(`[GroupCache] Miss for ${jid.split('@')[0]}`);
      return undefined;
    };
  }

  /**
   * Handle group events to update cache
   * Call this when receiving group-related events
   */
  handleGroupUpdate(accountId: string, groupJid: string, update: Partial<GroupMetadata>): void {
    const existing = this.get(accountId, groupJid);
    if (existing) {
      console.log(`[GroupCache] Updating ${groupJid.split('@')[0]}`);
      this.update(accountId, groupJid, update);
    }
  }

  /**
   * Handle participant updates
   */
  handleParticipantUpdate(
    accountId: string,
    groupJid: string,
    participants: string[],
    action: 'add' | 'remove' | 'promote' | 'demote'
  ): void {
    const existing = this.get(accountId, groupJid);
    if (!existing || !existing.participants) return;

    let updatedParticipants = [...existing.participants];

    switch (action) {
      case 'add':
        // Add new participants
        for (const p of participants) {
          if (!updatedParticipants.find(up => up.id === p)) {
            updatedParticipants.push({ id: p, admin: null });
          }
        }
        break;

      case 'remove':
        // Remove participants
        updatedParticipants = updatedParticipants.filter(
          up => !participants.includes(up.id)
        );
        break;

      case 'promote':
        // Promote to admin
        updatedParticipants = updatedParticipants.map(up =>
          participants.includes(up.id) ? { ...up, admin: 'admin' as const } : up
        );
        break;

      case 'demote':
        // Demote from admin
        updatedParticipants = updatedParticipants.map(up =>
          participants.includes(up.id) ? { ...up, admin: null } : up
        );
        break;
    }

    this.update(accountId, groupJid, { participants: updatedParticipants });
    console.log(`[GroupCache] Updated participants for ${groupJid.split('@')[0]} (${action})`);
  }

  /**
   * Clear cache for an account
   */
  clearAccount(accountId: string): void {
    const cache = this.caches.get(accountId);
    if (cache) {
      cache.flushAll();
      console.log(`[GroupCache] Cleared cache for account ${accountId}`);
    }
  }

  /**
   * Get cache statistics for an account
   */
  getStats(accountId: string): { keys: number; hits: number; misses: number } {
    const cache = this.caches.get(accountId);
    if (!cache) {
      return { keys: 0, hits: 0, misses: 0 };
    }
    const stats = cache.getStats();
    return { keys: stats.keys, hits: stats.hits, misses: stats.misses };
  }

  /**
   * Cleanup (call on shutdown or account disconnect)
   */
  cleanup(accountId: string): void {
    const cache = this.caches.get(accountId);
    if (cache) {
      cache.flushAll();
      cache.close();
      this.caches.delete(accountId);
      console.log(`[GroupCache] Cleaned up cache for account ${accountId}`);
    }
  }

  /**
   * Cleanup all caches
   */
  cleanupAll(): void {
    for (const [accountId] of this.caches) {
      this.cleanup(accountId);
    }
  }
}

// Singleton instance
export const groupMetadataCache = new GroupMetadataCacheService();
