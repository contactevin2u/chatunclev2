import { Worker, Job } from 'bullmq';
import { config } from '../config/env.js';
import { QUEUE_CONFIG } from '../config/constants.js';
import { getChannelRouter } from '../channels/router.js';
import { broadcastMessageStatus, broadcastHistorySyncProgress } from '../realtime/socket.js';
import { db, scheduledMessages, messages } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type {
  ScheduledMessageJobData,
  HistorySyncJobData,
  MediaProcessingJobData,
  WebhookDeliveryJobData,
  MessageValidityJobData,
  IdempotencyCleanupJobData,
  ConversationTimerJobData,
} from './setup.js';
import { webhookService } from '../services/webhooks.js';
import { validityService } from '../services/validity.js';
import { idempotencyService } from '../services/idempotency.js';
import { conversationStateService } from '../services/conversation-state.js';

const connection = config.redis.isConfigured
  ? { url: config.redis.url }
  : undefined;

let workers: Worker[] = [];

// ============================================
// SCHEDULED MESSAGE WORKER
// ============================================

async function processScheduledMessage(job: Job<ScheduledMessageJobData>): Promise<void> {
  const { scheduledMessageId, accountId, conversationId, recipientId, content, contentType, mediaUrl } = job.data;

  console.log(`[Worker] Processing scheduled message ${scheduledMessageId}`);

  try {
    const router = getChannelRouter();

    // Get the scheduled message from DB to verify it's still pending
    const scheduled = await db.query.scheduledMessages.findFirst({
      where: eq(scheduledMessages.id, scheduledMessageId),
    });

    if (!scheduled || scheduled.status !== 'pending') {
      console.log(`[Worker] Scheduled message ${scheduledMessageId} already processed or cancelled`);
      return;
    }

    // Send the message
    const result = await router.sendMessage({
      accountId,
      channelType: 'whatsapp', // TODO: Get from scheduled message
      recipientId,
      contentType: contentType as any,
      content,
      mediaUrl,
    });

    if (result.success) {
      // Update scheduled message status
      await db
        .update(scheduledMessages)
        .set({
          status: 'sent',
          sentAt: new Date(),
        })
        .where(eq(scheduledMessages.id, scheduledMessageId));

      // Broadcast success
      broadcastMessageStatus(accountId, {
        messageId: scheduledMessageId,
        status: 'sent',
      });

      console.log(`[Worker] Scheduled message ${scheduledMessageId} sent successfully`);
    } else {
      throw new Error(result.error || 'Failed to send');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Worker] Failed to send scheduled message:`, error);

    // Update status to failed
    await db
      .update(scheduledMessages)
      .set({
        status: 'failed',
        error: message,
      })
      .where(eq(scheduledMessages.id, scheduledMessageId));

    // Broadcast failure
    broadcastMessageStatus(job.data.accountId, {
      messageId: scheduledMessageId,
      status: 'failed',
      error: message,
    });

    throw error; // Re-throw for retry
  }
}

// ============================================
// HISTORY SYNC WORKER
// ============================================

async function processHistorySync(job: Job<HistorySyncJobData>): Promise<void> {
  const { accountId, type, syncGroups, syncProfiles, groupJids, contactJids } = job.data;

  console.log(`[Worker] Processing history sync for ${accountId} (${type})`);

  try {
    const router = getChannelRouter();
    const adapter = router.getAdapter('whatsapp');

    if (!adapter) {
      throw new Error('WhatsApp adapter not available');
    }

    if (!adapter.isConnected(accountId)) {
      throw new Error('WhatsApp session not connected');
    }

    // Handle different sync types
    if (type === 'metadata_only') {
      // Sync metadata only (groups and/or profiles)
      if (syncGroups && groupJids && groupJids.length > 0) {
        console.log(`[Worker] Syncing ${groupJids.length} groups for ${accountId}`);
        await (adapter as any).syncGroupMetadata(accountId, groupJids);
      }

      if (syncProfiles && contactJids && contactJids.length > 0) {
        console.log(`[Worker] Syncing ${contactJids.length} contact profiles for ${accountId}`);
        await (adapter as any).syncContactProfiles(accountId, contactJids);
      }
    } else if (type === 'full' || type === 'recent') {
      // Full or recent history sync
      // Get all groups and sync metadata
      if (syncGroups !== false) {
        const groups = await (adapter as any).getGroups(accountId);
        if (groups.length > 0) {
          console.log(`[Worker] Syncing metadata for ${groups.length} groups`);
          await (adapter as any).syncGroupMetadata(accountId, groups);
        }
      }

      // Note: Contact sync happens automatically via Baileys events
      // This worker is mainly for on-demand or scheduled metadata refresh
    }

    console.log(`[Worker] History sync completed for ${accountId}`);
  } catch (error) {
    console.error(`[Worker] History sync failed:`, error);
    throw error;
  }
}

// ============================================
// MEDIA PROCESSING WORKER
// ============================================

async function processMedia(job: Job<MediaProcessingJobData>): Promise<void> {
  const { messageId, accountId, mediaType, sourceUrl } = job.data;

  console.log(`[Worker] Processing media for message ${messageId}`);

  try {
    // TODO: Implement media processing
    // This would:
    // 1. Download media from source
    // 2. Upload to Cloudinary
    // 3. Update message with Cloudinary URL

    console.log(`[Worker] Media processed for message ${messageId}`);
  } catch (error) {
    console.error(`[Worker] Media processing failed:`, error);
    throw error;
  }
}

// ============================================
// WEBHOOK DELIVERY WORKER
// ============================================

async function processWebhookDelivery(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const { deliveryId } = job.data;

  console.log(`[Worker] Processing webhook delivery ${deliveryId}`);

  try {
    const success = await webhookService.deliverWebhook(deliveryId);

    if (!success) {
      throw new Error('Webhook delivery failed');
    }

    console.log(`[Worker] Webhook delivery ${deliveryId} completed`);
  } catch (error) {
    console.error(`[Worker] Webhook delivery ${deliveryId} failed:`, error);
    throw error; // Re-throw for retry
  }
}

// ============================================
// MESSAGE VALIDITY WORKER
// ============================================

async function processMessageValidity(job: Job<MessageValidityJobData>): Promise<void> {
  console.log('[Worker] Processing message validity check');

  try {
    const expiredCount = await validityService.processExpiredMessages();
    console.log(`[Worker] Expired ${expiredCount} messages`);
  } catch (error) {
    console.error('[Worker] Message validity check failed:', error);
    throw error;
  }
}

// ============================================
// IDEMPOTENCY CLEANUP WORKER
// ============================================

async function processIdempotencyCleanup(job: Job<IdempotencyCleanupJobData>): Promise<void> {
  console.log('[Worker] Processing idempotency cleanup');

  try {
    const cleanedCount = await idempotencyService.cleanupExpired();
    console.log(`[Worker] Cleaned up ${cleanedCount} idempotency keys`);
  } catch (error) {
    console.error('[Worker] Idempotency cleanup failed:', error);
    throw error;
  }
}

// ============================================
// CONVERSATION TIMER WORKER
// ============================================

async function processConversationTimers(job: Job<ConversationTimerJobData>): Promise<void> {
  console.log('[Worker] Processing conversation timers');

  try {
    const processedCount = await conversationStateService.processExpiredTimers();
    console.log(`[Worker] Processed ${processedCount} conversation timers`);
  } catch (error) {
    console.error('[Worker] Conversation timer processing failed:', error);
    throw error;
  }
}

// ============================================
// WORKER INITIALIZATION
// ============================================

export function initializeWorkers(): void {
  if (!config.redis.isConfigured) {
    console.log('[Workers] Redis not configured, workers disabled');
    return;
  }

  console.log('[Workers] Initializing queue workers...');

  // Scheduled message worker
  const scheduledMessageWorker = new Worker(
    'scheduled-messages',
    processScheduledMessage,
    {
      connection,
      concurrency: QUEUE_CONFIG.SCHEDULED_MESSAGE_CONCURRENCY,
    }
  );

  scheduledMessageWorker.on('completed', (job) => {
    console.log(`[Worker] Scheduled message job ${job.id} completed`);
  });

  scheduledMessageWorker.on('failed', (job, error) => {
    console.error(`[Worker] Scheduled message job ${job?.id} failed:`, error.message);
  });

  // History sync worker
  const historySyncWorker = new Worker(
    'history-sync',
    processHistorySync,
    {
      connection,
      concurrency: QUEUE_CONFIG.HISTORY_SYNC_CONCURRENCY,
    }
  );

  historySyncWorker.on('completed', (job) => {
    console.log(`[Worker] History sync job ${job.id} completed`);
  });

  historySyncWorker.on('failed', (job, error) => {
    console.error(`[Worker] History sync job ${job?.id} failed:`, error.message);
  });

  // Media processing worker
  const mediaWorker = new Worker(
    'media-processing',
    processMedia,
    {
      connection,
      concurrency: QUEUE_CONFIG.MEDIA_PROCESSING_CONCURRENCY,
    }
  );

  mediaWorker.on('completed', (job) => {
    console.log(`[Worker] Media processing job ${job.id} completed`);
  });

  mediaWorker.on('failed', (job, error) => {
    console.error(`[Worker] Media processing job ${job?.id} failed:`, error.message);
  });

  // Webhook delivery worker
  const webhookWorker = new Worker(
    'webhook-delivery',
    processWebhookDelivery,
    {
      connection,
      concurrency: 5,
    }
  );

  webhookWorker.on('completed', (job) => {
    console.log(`[Worker] Webhook delivery job ${job.id} completed`);
  });

  webhookWorker.on('failed', (job, error) => {
    console.error(`[Worker] Webhook delivery job ${job?.id} failed:`, error.message);
  });

  // Message validity worker
  const validityWorker = new Worker(
    'message-validity',
    processMessageValidity,
    {
      connection,
      concurrency: 1,
    }
  );

  validityWorker.on('completed', (job) => {
    console.log(`[Worker] Message validity job ${job.id} completed`);
  });

  validityWorker.on('failed', (job, error) => {
    console.error(`[Worker] Message validity job ${job?.id} failed:`, error.message);
  });

  // Idempotency cleanup worker
  const idempotencyWorker = new Worker(
    'idempotency-cleanup',
    processIdempotencyCleanup,
    {
      connection,
      concurrency: 1,
    }
  );

  idempotencyWorker.on('completed', (job) => {
    console.log(`[Worker] Idempotency cleanup job ${job.id} completed`);
  });

  idempotencyWorker.on('failed', (job, error) => {
    console.error(`[Worker] Idempotency cleanup job ${job?.id} failed:`, error.message);
  });

  // Conversation timer worker
  const timerWorker = new Worker(
    'conversation-timers',
    processConversationTimers,
    {
      connection,
      concurrency: 1,
    }
  );

  timerWorker.on('completed', (job) => {
    console.log(`[Worker] Conversation timer job ${job.id} completed`);
  });

  timerWorker.on('failed', (job, error) => {
    console.error(`[Worker] Conversation timer job ${job?.id} failed:`, error.message);
  });

  workers = [
    scheduledMessageWorker,
    historySyncWorker,
    mediaWorker,
    webhookWorker,
    validityWorker,
    idempotencyWorker,
    timerWorker,
  ];

  console.log('[Workers] All workers initialized');
}

/**
 * Close all workers
 */
export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map(w => w.close()));
  workers = [];
  console.log('[Workers] All workers closed');
}
