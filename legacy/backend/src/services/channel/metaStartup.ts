/**
 * Meta Session Restoration (Instagram & Facebook Messenger)
 *
 * Restores Meta connections on server startup.
 * Uses unified 'accounts' table with channel_type IN ('instagram', 'messenger')
 */

import { query } from '../../config/database';
import { instagramAdapter, messengerAdapter } from './adapters/MetaAdapter';

interface MetaAccount {
  id: string;
  user_id: string;
  channel_type: 'instagram' | 'messenger';
  channel_identifier: string;
  name: string;
  credentials: string;
  status: string;
}

/**
 * Restore all Meta sessions (Instagram and Messenger)
 */
export async function restoreMetaSessions(): Promise<void> {
  console.log('[Meta] Restoring Instagram and Messenger sessions...');

  try {
    // Get all Meta accounts that were previously connected (using unified accounts table)
    const accounts = await query<MetaAccount>(
      `SELECT id, user_id, channel_type, channel_identifier, name, credentials, status
       FROM accounts
       WHERE channel_type IN ('instagram', 'messenger') AND status IN ('connected', 'disconnected')`
    );

    if (accounts.length === 0) {
      console.log('[Meta] No Meta accounts to restore');
      return;
    }

    console.log(`[Meta] Found ${accounts.length} Meta accounts to restore`);

    let instagramRestored = 0;
    let messengerRestored = 0;
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
          console.error(`[Meta] Invalid credentials for account ${account.id}`);
          failed++;
          continue;
        }

        // Validate required credentials
        if (!credentials?.pageId || !credentials?.pageAccessToken) {
          console.warn(`[Meta] Missing page credentials for ${account.id}, skipping`);
          failed++;
          continue;
        }

        if (!credentials?.appSecret) {
          console.warn(`[Meta] Missing appSecret for ${account.id}, skipping`);
          failed++;
          continue;
        }

        // Instagram requires additional field
        if (account.channel_type === 'instagram' && !credentials?.instagramAccountId) {
          console.warn(`[Meta] Missing instagramAccountId for ${account.id}, skipping`);
          failed++;
          continue;
        }

        // Get appropriate adapter
        const adapter = account.channel_type === 'instagram' ? instagramAdapter : messengerAdapter;

        // Attempt to restore connection
        await adapter.connect(account.id, {
          credentials,
          settings: { channelType: account.channel_type }
        });

        if (account.channel_type === 'instagram') {
          instagramRestored++;
          console.log(`[Meta] Restored Instagram ${credentials.pageId} (${account.name})`);
        } else {
          messengerRestored++;
          console.log(`[Meta] Restored Messenger ${credentials.pageId} (${account.name})`);
        }

      } catch (error: any) {
        console.error(`[Meta] Failed to restore account ${account.id}:`, error.message);
        failed++;
      }
    }

    console.log(`[Meta] Session restoration complete: Instagram=${instagramRestored}, Messenger=${messengerRestored}, Failed=${failed}`);

  } catch (error) {
    console.error('[Meta] Error restoring sessions:', error);
  }
}

/**
 * Get count of active Instagram connections
 */
export function getActiveInstagramCount(): number {
  return instagramAdapter.getActiveAccounts().length;
}

/**
 * Get count of active Messenger connections
 */
export function getActiveMessengerCount(): number {
  return messengerAdapter.getActiveAccounts().length;
}
