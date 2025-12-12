import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env.js';
import { QUEUE_CONFIG } from '../config/constants.js';

// Default connection (in-memory if Redis not configured)
const connection = config.redis.isConfigured && config.redis.url
  ? { url: config.redis.url }
  : null;

// ============================================
// QUEUE DEFINITIONS
// ============================================

export const scheduledMessageQueue = connection
  ? new Queue('scheduled-messages', { connection })
  : null;

export const historySyncQueue = connection
  ? new Queue('history-sync', { connection })
  : null;

export const mediaProcessingQueue = connection
  ? new Queue('media-processing', { connection })
  : null;

export const notificationQueue = connection
  ? new Queue('notifications', { connection })
  : null;

// ============================================
// TWILIO-LIKE QUEUES
// ============================================

export const webhookDeliveryQueue = connection
  ? new Queue('webhook-delivery', { connection })
  : null;

export const messageValidityQueue = connection
  ? new Queue('message-validity', { connection })
  : null;

export const idempotencyCleanupQueue = connection
  ? new Queue('idempotency-cleanup', { connection })
  : null;

export const conversationTimerQueue = connection
  ? new Queue('conversation-timers', { connection })
  : null;

// ============================================
// JOB DATA TYPES
// ============================================

export interface ScheduledMessageJobData {
  scheduledMessageId: string;
  accountId: string;
  conversationId: string;
  recipientId: string;
  content?: string;
  contentType: string;
  mediaUrl?: string;
}

export interface HistorySyncJobData {
  accountId: string;
  type: 'full' | 'recent' | 'on_demand' | 'metadata_only';
  startDate?: string;
  endDate?: string;
  syncGroups?: boolean;
  syncProfiles?: boolean;
  groupJids?: string[];
  contactJids?: string[];
}

export interface MediaProcessingJobData {
  messageId: string;
  accountId: string;
  mediaType: string;
  sourceUrl: string;
  targetFormat?: string;
}

export interface NotificationJobData {
  userId: string;
  type: 'email' | 'push';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Twilio-like job data types
export interface WebhookDeliveryJobData {
  deliveryId: string;
  webhookId: string;
  accountId: string;
}

export interface MessageValidityJobData {
  batchSize: number;
}

export interface IdempotencyCleanupJobData {
  batchSize: number;
}

export interface ConversationTimerJobData {
  batchSize: number;
}

// ============================================
// QUEUE HELPERS
// ============================================

/**
 * Add a scheduled message job
 */
export async function addScheduledMessageJob(
  data: ScheduledMessageJobData,
  scheduledAt: Date
): Promise<string | null> {
  if (!scheduledMessageQueue) {
    console.warn('[Queue] Redis not configured, skipping scheduled message');
    return null;
  }

  const delay = scheduledAt.getTime() - Date.now();
  if (delay < 0) {
    console.warn('[Queue] Scheduled time is in the past');
    return null;
  }

  const job = await scheduledMessageQueue.add('send', data, {
    delay,
    removeOnComplete: true,
    removeOnFail: false,
    attempts: QUEUE_CONFIG.MAX_RETRIES,
    backoff: {
      type: 'exponential',
      delay: QUEUE_CONFIG.RETRY_DELAY_MS,
    },
  });

  return job.id || null;
}

/**
 * Add a history sync job
 */
export async function addHistorySyncJob(
  data: HistorySyncJobData
): Promise<string | null> {
  if (!historySyncQueue) {
    console.warn('[Queue] Redis not configured, skipping history sync job');
    return null;
  }

  const job = await historySyncQueue.add('sync', data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 2,
  });

  return job.id || null;
}

/**
 * Add a media processing job
 */
export async function addMediaProcessingJob(
  data: MediaProcessingJobData
): Promise<string | null> {
  if (!mediaProcessingQueue) {
    console.warn('[Queue] Redis not configured, skipping media processing');
    return null;
  }

  const job = await mediaProcessingQueue.add('process', data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
  });

  return job.id || null;
}

/**
 * Cancel a scheduled message job
 */
export async function cancelScheduledMessageJob(jobId: string): Promise<boolean> {
  if (!scheduledMessageQueue) return false;

  try {
    const job = await scheduledMessageQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Queue] Failed to cancel job:', error);
    return false;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  scheduledMessages: { waiting: number; active: number; delayed: number };
  historySync: { waiting: number; active: number };
  mediaProcessing: { waiting: number; active: number };
} | null> {
  if (!scheduledMessageQueue || !historySyncQueue || !mediaProcessingQueue) {
    return null;
  }

  const [smWaiting, smActive, smDelayed] = await Promise.all([
    scheduledMessageQueue.getWaitingCount(),
    scheduledMessageQueue.getActiveCount(),
    scheduledMessageQueue.getDelayedCount(),
  ]);

  const [hsWaiting, hsActive] = await Promise.all([
    historySyncQueue.getWaitingCount(),
    historySyncQueue.getActiveCount(),
  ]);

  const [mpWaiting, mpActive] = await Promise.all([
    mediaProcessingQueue.getWaitingCount(),
    mediaProcessingQueue.getActiveCount(),
  ]);

  return {
    scheduledMessages: { waiting: smWaiting, active: smActive, delayed: smDelayed },
    historySync: { waiting: hsWaiting, active: hsActive },
    mediaProcessing: { waiting: mpWaiting, active: mpActive },
  };
}

/**
 * Add a webhook delivery job
 */
export async function addWebhookDeliveryJob(
  data: WebhookDeliveryJobData
): Promise<string | null> {
  if (!webhookDeliveryQueue) {
    console.warn('[Queue] Redis not configured, skipping webhook delivery');
    return null;
  }

  const job = await webhookDeliveryQueue.add('deliver', data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });

  return job.id || null;
}

/**
 * Schedule recurring validity check job
 */
export async function scheduleValidityCheck(): Promise<void> {
  if (!messageValidityQueue) return;

  // Remove existing repeatable jobs
  const existingJobs = await messageValidityQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await messageValidityQueue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job (every minute)
  await messageValidityQueue.add(
    'check-validity',
    { batchSize: 100 },
    {
      repeat: { every: 60000 }, // Every minute
      removeOnComplete: true,
    }
  );

  console.log('[Queue] Message validity check scheduled');
}

/**
 * Schedule recurring idempotency cleanup job
 */
export async function scheduleIdempotencyCleanup(): Promise<void> {
  if (!idempotencyCleanupQueue) return;

  // Remove existing repeatable jobs
  const existingJobs = await idempotencyCleanupQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await idempotencyCleanupQueue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job (every hour)
  await idempotencyCleanupQueue.add(
    'cleanup',
    { batchSize: 1000 },
    {
      repeat: { every: 3600000 }, // Every hour
      removeOnComplete: true,
    }
  );

  console.log('[Queue] Idempotency cleanup scheduled');
}

/**
 * Schedule recurring conversation timer check job
 */
export async function scheduleConversationTimerCheck(): Promise<void> {
  if (!conversationTimerQueue) return;

  // Remove existing repeatable jobs
  const existingJobs = await conversationTimerQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await conversationTimerQueue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job (every minute)
  await conversationTimerQueue.add(
    'check-timers',
    { batchSize: 100 },
    {
      repeat: { every: 60000 }, // Every minute
      removeOnComplete: true,
    }
  );

  console.log('[Queue] Conversation timer check scheduled');
}

/**
 * Close all queues
 */
export async function closeQueues(): Promise<void> {
  const queues = [
    scheduledMessageQueue,
    historySyncQueue,
    mediaProcessingQueue,
    notificationQueue,
    webhookDeliveryQueue,
    messageValidityQueue,
    idempotencyCleanupQueue,
    conversationTimerQueue,
  ].filter(Boolean);

  await Promise.all(queues.map(q => q?.close()));
  console.log('[Queue] All queues closed');
}
