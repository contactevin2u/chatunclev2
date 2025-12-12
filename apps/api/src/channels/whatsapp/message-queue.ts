import PQueue from 'p-queue';
import { QUEUE_CONFIG } from '../../config/constants.js';
import type { SendMessageParams, SendResult } from '@chatuncle/shared';

interface QueuedMessage {
  id: string;
  params: SendMessageParams;
  priority: number;
  resolve: (result: SendResult) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  retryCount: number;
}

/**
 * Message queue for WhatsApp with rate limiting
 * Uses p-queue for ordered execution with concurrency=1
 */
export class MessageQueue {
  private accountId: string;
  private queue: PQueue;
  private pendingMessages = new Map<string, QueuedMessage>();
  private sendHandler?: (params: SendMessageParams) => Promise<SendResult>;

  constructor(accountId: string) {
    this.accountId = accountId;
    this.queue = new PQueue({
      concurrency: QUEUE_CONFIG.WHATSAPP_CONCURRENCY,
      interval: QUEUE_CONFIG.WHATSAPP_INTERVAL_MS,
      intervalCap: 1,
    });

    // Log queue events
    this.queue.on('active', () => {
      console.log(`[MessageQueue:${accountId}] Active: ${this.queue.pending} pending`);
    });

    this.queue.on('idle', () => {
      console.log(`[MessageQueue:${accountId}] Queue idle`);
    });
  }

  /**
   * Set the send handler function
   */
  setSendHandler(handler: (params: SendMessageParams) => Promise<SendResult>): void {
    this.sendHandler = handler;
  }

  /**
   * Add a message to the queue
   * @param params Send parameters
   * @param priority Priority (higher = more urgent, default 0)
   * @returns Promise that resolves when message is sent
   */
  async enqueue(params: SendMessageParams, priority: number = 0): Promise<SendResult> {
    // Check queue size limit
    if (this.queue.size >= QUEUE_CONFIG.WHATSAPP_MAX_SIZE) {
      return {
        success: false,
        error: 'Message queue is full',
        retryable: true,
      };
    }

    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const queued: QueuedMessage = {
        id,
        params,
        priority,
        resolve,
        reject,
        createdAt: new Date(),
        retryCount: 0,
      };

      this.pendingMessages.set(id, queued);

      this.queue.add(
        async () => {
          try {
            const result = await this.processMessage(queued);
            this.pendingMessages.delete(id);
            resolve(result);
          } catch (error) {
            this.pendingMessages.delete(id);
            reject(error);
          }
        },
        { priority }
      );
    });
  }

  /**
   * Add a high-priority message (skips to front)
   */
  async enqueueUrgent(params: SendMessageParams): Promise<SendResult> {
    return this.enqueue(params, 100);
  }

  /**
   * Process a queued message
   */
  private async processMessage(queued: QueuedMessage): Promise<SendResult> {
    if (!this.sendHandler) {
      return {
        success: false,
        error: 'Send handler not configured',
      };
    }

    try {
      const result = await this.sendHandler(queued.params);

      if (!result.success && result.retryable && queued.retryCount < QUEUE_CONFIG.MAX_RETRIES) {
        // Retry with backoff
        queued.retryCount++;
        const delay = QUEUE_CONFIG.RETRY_DELAY_MS * Math.pow(2, queued.retryCount - 1);
        console.log(`[MessageQueue] Retrying message ${queued.id} in ${delay}ms (attempt ${queued.retryCount})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processMessage(queued);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (queued.retryCount < QUEUE_CONFIG.MAX_RETRIES) {
        queued.retryCount++;
        const delay = QUEUE_CONFIG.RETRY_DELAY_MS * Math.pow(2, queued.retryCount - 1);
        console.log(`[MessageQueue] Retrying after error ${queued.id} in ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processMessage(queued);
      }

      return {
        success: false,
        error: message,
        retryable: false,
      };
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    size: number;
    isPaused: boolean;
  } {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      isPaused: this.queue.isPaused,
    };
  }

  /**
   * Pause the queue
   */
  pause(): void {
    this.queue.pause();
    console.log(`[MessageQueue:${this.accountId}] Paused`);
  }

  /**
   * Resume the queue
   */
  resume(): void {
    this.queue.start();
    console.log(`[MessageQueue:${this.accountId}] Resumed`);
  }

  /**
   * Clear all pending messages
   */
  clear(): void {
    this.queue.clear();
    for (const [id, msg] of this.pendingMessages) {
      msg.reject(new Error('Queue cleared'));
    }
    this.pendingMessages.clear();
    console.log(`[MessageQueue:${this.accountId}] Cleared`);
  }

  /**
   * Wait for all messages to be processed
   */
  async drain(): Promise<void> {
    await this.queue.onIdle();
  }
}
