/**
 * Message Retry Queue with Exponential Backoff
 *
 * Handles automatic retry of failed messages with increasing delays.
 * Supports all channel types (WhatsApp, Telegram, etc.)
 */

import { query, queryOne, execute } from '../config/database';
import { sessionManager } from './whatsapp/SessionManager';
import { telegramAdapter } from './channel';
import { getIO } from './socket';
import { sleep } from './antiBan';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000; // 5 seconds
const MAX_DELAY_MS = 300000; // 5 minutes
const RETRY_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

// In-memory retry tracking (to prevent duplicate retries)
const retryingMessages = new Set<string>();

let retryInterval: NodeJS.Timeout | null = null;

/**
 * Calculate exponential backoff delay
 * Formula: min(BASE_DELAY * 2^attempt, MAX_DELAY) + random jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  // Add 10-30% random jitter to prevent thundering herd
  const jitter = exponentialDelay * (0.1 + Math.random() * 0.2);
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Queue a message for retry
 * Called when a message send fails
 */
export async function queueMessageForRetry(messageId: string): Promise<void> {
  try {
    // Check if message exists and is eligible for retry
    const message = await queryOne<{
      id: string;
      retry_count: number;
      status: string;
    }>(`
      SELECT id, COALESCE(retry_count, 0) as retry_count, status
      FROM messages WHERE id = $1
    `, [messageId]);

    if (!message) {
      console.log(`[RetryQueue] Message ${messageId} not found`);
      return;
    }

    if (message.status !== 'failed') {
      console.log(`[RetryQueue] Message ${messageId} is not in failed status, skipping`);
      return;
    }

    if (message.retry_count >= MAX_RETRIES) {
      console.log(`[RetryQueue] Message ${messageId} has exceeded max retries (${MAX_RETRIES})`);
      return;
    }

    // Calculate next retry time
    const delayMs = calculateBackoffDelay(message.retry_count);
    const nextRetryAt = new Date(Date.now() + delayMs);

    // Update message with retry info
    await execute(`
      UPDATE messages
      SET retry_count = COALESCE(retry_count, 0) + 1,
          next_retry_at = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [messageId, nextRetryAt.toISOString()]);

    console.log(`[RetryQueue] Queued message ${messageId} for retry #${message.retry_count + 1} at ${nextRetryAt.toISOString()} (delay: ${delayMs}ms)`);
  } catch (error) {
    console.error(`[RetryQueue] Error queueing message ${messageId} for retry:`, error);
  }
}

/**
 * Process messages due for retry
 */
async function processRetryQueue(): Promise<void> {
  try {
    // Get messages due for retry
    const pendingRetries = await query<{
      id: string;
      conversation_id: string;
      content_type: string;
      content: string;
      media_url: string | null;
      media_mime_type: string | null;
      retry_count: number;
      agent_id: string;
      quoted_message_id: string | null;
      quoted_wa_message_id: string | null;
      account_id: string;
      channel_type: string;
      is_group: boolean;
      wa_id: string | null;
      jid_type: string | null;
      group_jid: string | null;
      telegram_chat_id: number | null;
    }>(`
      SELECT m.id, m.conversation_id, m.content_type, m.content,
             m.media_url, m.media_mime_type, m.retry_count, m.agent_id,
             m.quoted_message_id, m.quoted_wa_message_id,
             c.account_id, COALESCE(c.channel_type, 'whatsapp') as channel_type,
             c.is_group, c.telegram_chat_id,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE m.status = 'failed'
        AND m.next_retry_at IS NOT NULL
        AND m.next_retry_at <= NOW()
        AND COALESCE(m.retry_count, 0) < $1
      ORDER BY m.next_retry_at ASC
      LIMIT 5
    `, [MAX_RETRIES]);

    if (pendingRetries.length === 0) {
      return;
    }

    console.log(`[RetryQueue] Processing ${pendingRetries.length} messages for retry`);

    for (const msg of pendingRetries) {
      // Skip if already retrying (prevent duplicate retries)
      if (retryingMessages.has(msg.id)) {
        console.log(`[RetryQueue] Message ${msg.id} already being retried, skipping`);
        continue;
      }

      retryingMessages.add(msg.id);

      try {
        console.log(`[RetryQueue] Retrying message ${msg.id} (attempt ${msg.retry_count}/${MAX_RETRIES})`);

        // Update status to indicate retry in progress
        await execute(`
          UPDATE messages SET status = 'pending', updated_at = NOW() WHERE id = $1
        `, [msg.id]);

        // Emit status update
        const io = getIO();
        io.to(`account:${msg.account_id}`).emit('message:status', {
          accountId: msg.account_id,
          channelType: msg.channel_type,
          messageId: msg.id,
          status: 'pending',
          isRetry: true,
          retryCount: msg.retry_count,
        });

        let channelMessageId: string;

        if (msg.channel_type === 'telegram') {
          // Telegram retry
          if (!msg.telegram_chat_id) {
            throw new Error('No Telegram chat ID');
          }

          if (!telegramAdapter.isConnected(msg.account_id)) {
            throw new Error('Telegram bot not connected');
          }

          const result = await telegramAdapter.sendMessage(
            msg.account_id,
            String(msg.telegram_chat_id),
            {
              type: msg.content_type as any,
              content: msg.content || undefined,
              mediaUrl: msg.media_url || undefined,
              caption: msg.content || undefined,
            }
          );

          if (!result.success || !result.messageId) {
            throw new Error(result.error || 'Failed to send Telegram message');
          }
          channelMessageId = result.messageId;

        } else {
          // WhatsApp retry
          const jid = msg.is_group
            ? msg.group_jid
            : `${msg.wa_id}@${(msg.jid_type || 'pn') === 'lid' ? 'lid' : 's.whatsapp.net'}`;

          if (!jid) {
            throw new Error('Could not determine recipient JID');
          }

          // Build quoted message key if this was a reply
          let quotedMessageKey: any = undefined;
          if (msg.quoted_wa_message_id) {
            quotedMessageKey = {
              remoteJid: jid,
              id: msg.quoted_wa_message_id,
              fromMe: false, // Best guess - we don't have full info here
            };
          }

          if (msg.is_group) {
            channelMessageId = await sessionManager.sendGroupMessage(
              msg.account_id,
              jid,
              {
                type: msg.content_type as any,
                content: msg.content || undefined,
                mediaUrl: msg.media_url || undefined,
                mediaMimeType: msg.media_mime_type || undefined,
                quotedMessageKey,
              }
            );
          } else {
            channelMessageId = await sessionManager.sendMessage(
              msg.account_id,
              msg.wa_id!,
              {
                type: msg.content_type as any,
                content: msg.content || undefined,
                mediaUrl: msg.media_url || undefined,
                mediaMimeType: msg.media_mime_type || undefined,
                quotedMessageKey,
              },
              { jidType: msg.jid_type as 'lid' | 'pn' || 'pn' }
            );
          }
        }

        // Success! Update message
        await execute(`
          UPDATE messages
          SET wa_message_id = $1, status = 'sent', next_retry_at = NULL, updated_at = NOW()
          WHERE id = $2
        `, [channelMessageId, msg.id]);

        // Notify success
        io.to(`account:${msg.account_id}`).emit('message:status', {
          accountId: msg.account_id,
          channelType: msg.channel_type,
          messageId: msg.id,
          waMessageId: channelMessageId,
          status: 'sent',
          isRetry: true,
        });

        console.log(`[RetryQueue] Message ${msg.id} sent successfully on retry #${msg.retry_count}`);

      } catch (error: any) {
        console.error(`[RetryQueue] Retry failed for message ${msg.id}:`, error.message);

        // Check if we should queue for another retry
        if (msg.retry_count < MAX_RETRIES) {
          // Queue for next retry
          const delayMs = calculateBackoffDelay(msg.retry_count);
          const nextRetryAt = new Date(Date.now() + delayMs);

          await execute(`
            UPDATE messages
            SET status = 'failed',
                retry_count = $2,
                next_retry_at = $3,
                updated_at = NOW()
            WHERE id = $1
          `, [msg.id, msg.retry_count + 1, nextRetryAt.toISOString()]);

          // Notify frontend
          const io = getIO();
          io.to(`account:${msg.account_id}`).emit('message:status', {
            accountId: msg.account_id,
            channelType: msg.channel_type,
            messageId: msg.id,
            status: 'failed',
            error: error.message,
            isRetry: true,
            retryCount: msg.retry_count + 1,
            nextRetryAt: nextRetryAt.toISOString(),
          });

          console.log(`[RetryQueue] Message ${msg.id} queued for retry #${msg.retry_count + 1} at ${nextRetryAt.toISOString()}`);
        } else {
          // Max retries exceeded - permanent failure
          await execute(`
            UPDATE messages
            SET status = 'failed',
                next_retry_at = NULL,
                updated_at = NOW()
            WHERE id = $1
          `, [msg.id]);

          const io = getIO();
          io.to(`account:${msg.account_id}`).emit('message:status', {
            accountId: msg.account_id,
            channelType: msg.channel_type,
            messageId: msg.id,
            status: 'failed',
            error: `Failed after ${MAX_RETRIES} retries: ${error.message}`,
            isRetry: true,
            permanentFailure: true,
          });

          console.log(`[RetryQueue] Message ${msg.id} permanently failed after ${MAX_RETRIES} retries`);
        }
      } finally {
        retryingMessages.delete(msg.id);
      }

      // Small delay between retries to avoid rate limiting
      await sleep(2000);
    }
  } catch (error) {
    console.error('[RetryQueue] Error processing retry queue:', error);
  }
}

/**
 * Start the retry queue processor
 */
export function startRetryQueueProcessor(): void {
  if (retryInterval) {
    console.log('[RetryQueue] Processor already running');
    return;
  }

  console.log('[RetryQueue] Starting retry queue processor');

  // Run immediately, then on interval
  processRetryQueue();
  retryInterval = setInterval(processRetryQueue, RETRY_CHECK_INTERVAL_MS);
}

/**
 * Stop the retry queue processor
 */
export function stopRetryQueueProcessor(): void {
  if (retryInterval) {
    console.log('[RetryQueue] Stopping retry queue processor');
    clearInterval(retryInterval);
    retryInterval = null;
  }
}

/**
 * Get retry statistics for an account
 */
export async function getRetryStats(accountId: string): Promise<{
  pendingRetries: number;
  failedPermanently: number;
  retriedSuccessfully: number;
}> {
  const stats = await queryOne<{
    pending_retries: string;
    failed_permanently: string;
    retried_successfully: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE m.status = 'failed' AND m.next_retry_at IS NOT NULL) as pending_retries,
      COUNT(*) FILTER (WHERE m.status = 'failed' AND m.next_retry_at IS NULL AND COALESCE(m.retry_count, 0) >= $2) as failed_permanently,
      COUNT(*) FILTER (WHERE m.status = 'sent' AND COALESCE(m.retry_count, 0) > 0) as retried_successfully
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.account_id = $1
      AND m.created_at > NOW() - INTERVAL '24 hours'
  `, [accountId, MAX_RETRIES]);

  return {
    pendingRetries: parseInt(stats?.pending_retries || '0', 10),
    failedPermanently: parseInt(stats?.failed_permanently || '0', 10),
    retriedSuccessfully: parseInt(stats?.retried_successfully || '0', 10),
  };
}

/**
 * Manually retry a specific failed message
 */
export async function manualRetryMessage(messageId: string): Promise<boolean> {
  try {
    const message = await queryOne<{ id: string; status: string }>(`
      SELECT id, status FROM messages WHERE id = $1
    `, [messageId]);

    if (!message || message.status !== 'failed') {
      return false;
    }

    // Reset retry count and queue immediately
    await execute(`
      UPDATE messages
      SET retry_count = 0,
          next_retry_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [messageId]);

    console.log(`[RetryQueue] Manual retry queued for message ${messageId}`);
    return true;
  } catch (error) {
    console.error(`[RetryQueue] Error queueing manual retry:`, error);
    return false;
  }
}
