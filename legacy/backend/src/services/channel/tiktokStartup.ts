/**
 * TikTok Shop Session Restoration
 *
 * Restores TikTok Shop connections on server startup.
 * Uses unified 'accounts' table with channel_type = 'tiktok'
 */

import { query } from '../../config/database';
import { tiktokAdapter } from './adapters/TikTokAdapter';

interface TikTokAccount {
  id: string;
  user_id: string;
  channel_identifier: string;
  name: string;
  credentials: string;
  status: string;
}

/**
 * Restore all TikTok Shop sessions from the database
 */
export async function restoreTikTokSessions(): Promise<void> {
  console.log('[TikTok] Restoring TikTok Shop sessions...');

  try {
    // Get all TikTok accounts that were previously connected (using unified accounts table)
    const accounts = await query<TikTokAccount>(
      `SELECT id, user_id, channel_identifier, name, credentials, status
       FROM accounts
       WHERE channel_type = 'tiktok' AND status IN ('connected', 'disconnected')`
    );

    if (accounts.length === 0) {
      console.log('[TikTok] No TikTok Shop accounts to restore');
      return;
    }

    console.log(`[TikTok] Found ${accounts.length} TikTok Shop accounts to restore`);

    let restored = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        // Parse credentials
        let credentials: any;
        try {
          credentials = typeof account.credentials === 'string'
            ? JSON.parse(account.credentials)
            : account.credentials;
        } catch (parseError) {
          console.error(`[TikTok] Invalid credentials for account ${account.id}`);
          failed++;
          continue;
        }

        // Validate required credentials
        if (!credentials?.appKey || !credentials?.appSecret) {
          console.warn(`[TikTok] Missing app credentials for ${account.id}, skipping`);
          failed++;
          continue;
        }

        if (!credentials?.accessToken || !credentials?.refreshToken) {
          console.warn(`[TikTok] Missing OAuth tokens for ${account.id}, skipping`);
          failed++;
          continue;
        }

        if (!credentials?.shopId || !credentials?.shopCipher) {
          console.warn(`[TikTok] Missing shop info for ${account.id}, skipping`);
          failed++;
          continue;
        }

        // Attempt to restore connection
        await tiktokAdapter.connect(account.id, { credentials });
        restored++;
        console.log(`[TikTok] Restored shop ${credentials.shopId} (${account.name})`);

      } catch (error: any) {
        console.error(`[TikTok] Failed to restore account ${account.id}:`, error.message);
        failed++;
      }
    }

    console.log(`[TikTok] Session restoration complete: ${restored} restored, ${failed} failed`);

  } catch (error) {
    console.error('[TikTok] Error restoring sessions:', error);
  }
}

/**
 * Get count of active TikTok connections
 */
export function getActiveTikTokCount(): number {
  return tiktokAdapter.getActiveAccounts().length;
}
