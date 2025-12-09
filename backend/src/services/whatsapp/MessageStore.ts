/**
 * Message Store for Baileys
 *
 * Implements a message store for better retry handling and poll decryption.
 * Baileys uses getMessage callback to:
 * 1. Retry failed message sends
 * 2. Decrypt poll votes
 * 3. Handle message reactions
 *
 * This store caches messages in memory with LRU eviction and falls back
 * to database queries for older messages.
 */

import NodeCache from 'node-cache';
import { proto, WAMessageKey } from '@whiskeysockets/baileys';
import { queryOne } from '../../config/database';

interface StoredMessage {
  key: WAMessageKey;
  message: proto.IMessage;
  timestamp: number;
}

class MessageStoreService {
  // In-memory cache with 30 minute TTL (messages older than this use DB lookup)
  private cache: NodeCache;

  // Maximum messages to keep in memory per account
  private maxMessagesPerAccount = 1000;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 1800,        // 30 minutes TTL
      checkperiod: 300,    // Check for expired keys every 5 minutes
      useClones: false,    // Don't clone for performance
      maxKeys: 50000,      // Max 50k messages across all accounts (increased from 10k)
    });

    // Log cache stats periodically
    setInterval(() => {
      const stats = this.cache.getStats();
      if (stats.keys > 0) {
        console.log(`[MessageStore] Cache stats: ${stats.keys} messages, ${stats.hits} hits, ${stats.misses} misses`);
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Generate cache key from WAMessageKey
   */
  private getCacheKey(accountId: string, key: WAMessageKey): string {
    return `${accountId}:${key.remoteJid}:${key.id}`;
  }

  /**
   * Store a message in the cache
   * Called when receiving or sending messages
   */
  store(accountId: string, key: WAMessageKey, message: proto.IMessage): void {
    const cacheKey = this.getCacheKey(accountId, key);
    const stored: StoredMessage = {
      key,
      message,
      timestamp: Date.now(),
    };
    this.cache.set(cacheKey, stored);
  }

  /**
   * Store multiple messages (for batch operations like history sync)
   */
  storeBatch(accountId: string, messages: Array<{ key: WAMessageKey; message: proto.IMessage }>): void {
    for (const { key, message } of messages) {
      this.store(accountId, key, message);
    }
  }

  /**
   * Get a message from cache or database
   * This is the main function used by Baileys' getMessage callback
   */
  async getMessage(accountId: string, key: WAMessageKey): Promise<proto.IMessage | undefined> {
    // First check in-memory cache
    const cacheKey = this.getCacheKey(accountId, key);
    const cached = this.cache.get<StoredMessage>(cacheKey);

    if (cached) {
      console.log(`[MessageStore] Cache hit for message ${key.id}`);
      return cached.message;
    }

    // Fall back to database
    try {
      const dbMessage = await queryOne(
        `SELECT content, content_type, media_url, media_mime_type
         FROM messages
         WHERE wa_message_id = $1`,
        [key.id]
      );

      if (dbMessage) {
        console.log(`[MessageStore] DB hit for message ${key.id}`);

        // Reconstruct proto message based on content type
        let message: proto.IMessage;

        switch (dbMessage.content_type) {
          case 'image':
            message = {
              imageMessage: {
                url: dbMessage.media_url,
                mimetype: dbMessage.media_mime_type,
                caption: dbMessage.content,
              },
            };
            break;

          case 'video':
            message = {
              videoMessage: {
                url: dbMessage.media_url,
                mimetype: dbMessage.media_mime_type,
                caption: dbMessage.content,
              },
            };
            break;

          case 'audio':
            message = {
              audioMessage: {
                url: dbMessage.media_url,
                mimetype: dbMessage.media_mime_type,
              },
            };
            break;

          case 'document':
            message = {
              documentMessage: {
                url: dbMessage.media_url,
                mimetype: dbMessage.media_mime_type,
                fileName: dbMessage.content,
              },
            };
            break;

          case 'text':
          default:
            message = {
              conversation: dbMessage.content,
            };
            break;
        }

        // Cache for future lookups
        this.store(accountId, key, message);

        return message;
      }
    } catch (error) {
      console.error(`[MessageStore] Error fetching message ${key.id}:`, error);
    }

    console.log(`[MessageStore] Message not found: ${key.id}`);
    return undefined;
  }

  /**
   * Create getMessage callback for Baileys socket configuration
   * This returns a function bound to a specific account
   */
  createGetMessageCallback(accountId: string): (key: WAMessageKey) => Promise<proto.IMessage> {
    return async (key: WAMessageKey): Promise<proto.IMessage> => {
      const message = await this.getMessage(accountId, key);
      return message || proto.Message.fromObject({});
    };
  }

  /**
   * Delete a message from cache
   */
  delete(accountId: string, key: WAMessageKey): void {
    const cacheKey = this.getCacheKey(accountId, key);
    this.cache.del(cacheKey);
  }

  /**
   * Clear all messages for an account
   */
  clearAccount(accountId: string): void {
    const keys = this.cache.keys();
    const accountKeys = keys.filter(k => k.startsWith(`${accountId}:`));
    this.cache.del(accountKeys);
    console.log(`[MessageStore] Cleared ${accountKeys.length} messages for account ${accountId}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { keys: number; hits: number; misses: number; ksize: number; vsize: number } {
    return this.cache.getStats();
  }

  /**
   * Cleanup (call on shutdown)
   */
  cleanup(): void {
    this.cache.flushAll();
    console.log('[MessageStore] Cache flushed');
  }
}

// Singleton instance
export const messageStore = new MessageStoreService();
