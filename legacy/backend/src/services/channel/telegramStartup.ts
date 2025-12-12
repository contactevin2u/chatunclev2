/**
 * Telegram Startup Service
 * Handles restoration of Telegram bot sessions on server startup
 *
 * Uses unified 'accounts' table with channel_type = 'telegram'
 */

import { query } from '../../config/database';
import { telegramAdapter } from './adapters/TelegramAdapter';

interface TelegramAccount {
  id: string;
  user_id: string;
  channel_identifier: string;
  name: string;
  credentials: any;
  status: string;
}

/**
 * Restore all Telegram bot sessions from the database
 * Called on server startup
 */
export async function restoreTelegramSessions(): Promise<void> {
  console.log('[TelegramStartup] Restoring Telegram bot sessions...');

  try {
    // Get all Telegram accounts that were previously connected (using unified accounts table)
    const accounts = await query<TelegramAccount>(
      `SELECT id, user_id, channel_identifier, name, credentials, status
       FROM accounts
       WHERE channel_type = 'telegram' AND status IN ('connected', 'disconnected')`,
      []
    );

    console.log(`[TelegramStartup] Found ${accounts.length} Telegram accounts to restore`);

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
        } catch {
          console.error(`[TelegramStartup] Invalid credentials for account ${account.id}`);
          failed++;
          continue;
        }

        if (!credentials?.botToken) {
          console.warn(`[TelegramStartup] No bot token for account ${account.id}`);
          failed++;
          continue;
        }

        // Restore the connection
        console.log(`[TelegramStartup] Restoring @${account.channel_identifier} (${account.id})...`);
        await telegramAdapter.connect(account.id, { credentials });
        restored++;
        console.log(`[TelegramStartup] Restored @${account.channel_identifier}`);
      } catch (error) {
        console.error(`[TelegramStartup] Failed to restore ${account.id}:`, error);
        failed++;
      }
    }

    console.log(`[TelegramStartup] Complete: ${restored} restored, ${failed} failed`);
  } catch (error) {
    console.error('[TelegramStartup] Error restoring sessions:', error);
  }
}
