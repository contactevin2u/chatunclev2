import { createHmac, randomBytes } from 'crypto';
import { eq, and, lt, isNotNull, sql } from 'drizzle-orm';
import type {
  WebhookPayload,
  WebhookEventType,
  WebhookHeaders,
  WebhookDeliveryStatus,
} from '@chatuncle/shared';
import { db } from '../db/index.js';
import { webhookConfigs, webhookDeliveries } from '../db/schema.js';

const WEBHOOK_SETTINGS = {
  MAX_RETRIES: 5,
  INITIAL_BACKOFF_MS: 1000,
  MAX_BACKOFF_MS: 300000, // 5 minutes
  BACKOFF_MULTIPLIER: 2,
  REQUEST_TIMEOUT_MS: 30000,
  SIGNATURE_ALGORITHM: 'sha256',
  MAX_CONSECUTIVE_FAILURES: 10,
};

/**
 * Webhook service for Twilio-like status callbacks
 */
export class WebhookService {
  /**
   * Generate a new webhook secret
   */
  static generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   *
   * Signature format: t=timestamp,v1=signature
   */
  static signPayload(payload: object, secret: string, timestamp: number): string {
    const payloadString = JSON.stringify(payload);
    const signatureBase = `${timestamp}.${payloadString}`;

    const signature = createHmac(WEBHOOK_SETTINGS.SIGNATURE_ALGORITHM, secret)
      .update(signatureBase)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string,
    toleranceSeconds: number = 300
  ): boolean {
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = parseInt(timestampPart.slice(2), 10);
    const providedSignature = signaturePart.slice(3);

    // Check timestamp tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    // Compute expected signature
    const signatureBase = `${timestamp}.${payload}`;
    const expectedSignature = createHmac(WEBHOOK_SETTINGS.SIGNATURE_ALGORITHM, secret)
      .update(signatureBase)
      .digest('hex');

    // Constant-time comparison
    return timingSafeEqual(providedSignature, expectedSignature);
  }

  /**
   * Get webhook configuration for an account
   */
  async getConfig(accountId: string) {
    const configs = await db
      .select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.accountId, accountId))
      .limit(1);

    return configs[0] || null;
  }

  /**
   * Create webhook configuration
   */
  async createConfig(
    accountId: string,
    url: string,
    events: WebhookEventType[]
  ) {
    const secret = WebhookService.generateSecret();

    const [config] = await db
      .insert(webhookConfigs)
      .values({
        accountId,
        url,
        secret,
        events,
        isActive: true,
      })
      .returning();

    return config;
  }

  /**
   * Update webhook configuration
   */
  async updateConfig(
    accountId: string,
    updates: {
      url?: string;
      events?: WebhookEventType[];
      isActive?: boolean;
    }
  ) {
    const [config] = await db
      .update(webhookConfigs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(webhookConfigs.accountId, accountId))
      .returning();

    return config;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(accountId: string): Promise<string> {
    const newSecret = WebhookService.generateSecret();

    await db
      .update(webhookConfigs)
      .set({
        secret: newSecret,
        updatedAt: new Date(),
      })
      .where(eq(webhookConfigs.accountId, accountId));

    return newSecret;
  }

  /**
   * Delete webhook configuration
   */
  async deleteConfig(accountId: string): Promise<void> {
    await db
      .delete(webhookConfigs)
      .where(eq(webhookConfigs.accountId, accountId));
  }

  /**
   * Queue a webhook delivery
   */
  async queueWebhook(
    accountId: string,
    eventType: WebhookEventType,
    data: object
  ): Promise<string | null> {
    const config = await this.getConfig(accountId);

    // Check if webhook is configured and active
    if (!config || !config.isActive) {
      return null;
    }

    // Check if this event type is subscribed
    const events = config.events as string[];
    if (!events.includes(eventType)) {
      return null;
    }

    // Build payload
    const payload: WebhookPayload = {
      eventType,
      accountId,
      timestamp: new Date().toISOString(),
      requestId: `wh_${randomBytes(16).toString('hex')}`,
      data: data as any,
    };

    // Create delivery record
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        webhookId: config.id,
        eventType,
        payload,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: WEBHOOK_SETTINGS.MAX_RETRIES,
        nextRetryAt: new Date(),
      })
      .returning();

    return delivery.id;
  }

  /**
   * Process a webhook delivery
   */
  async deliverWebhook(deliveryId: string): Promise<boolean> {
    // Get delivery with webhook config
    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId))
      .limit(1);

    const delivery = deliveries[0];
    if (!delivery) {
      console.error(`[Webhook] Delivery ${deliveryId} not found`);
      return false;
    }

    // Get webhook config
    const configs = await db
      .select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.id, delivery.webhookId))
      .limit(1);

    const config = configs[0];
    if (!config || !config.isActive) {
      await this.markDeliveryStatus(deliveryId, 'exhausted', 'Webhook is disabled');
      return false;
    }

    // Mark as delivering
    await db
      .update(webhookDeliveries)
      .set({
        status: 'delivering',
        attemptCount: delivery.attemptCount + 1,
        lastAttemptAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    // Sign the payload
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = WebhookService.signPayload(delivery.payload as object, config.secret, timestamp);

    // Prepare headers
    const headers: WebhookHeaders = {
      'Content-Type': 'application/json',
      'X-ChatUncle-Signature': signature,
      'X-ChatUncle-Request-Id': (delivery.payload as any).requestId,
      'X-ChatUncle-Timestamp': timestamp.toString(),
    };

    try {
      // Make the request with timeout
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        WEBHOOK_SETTINGS.REQUEST_TIMEOUT_MS
      );

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(delivery.payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Check response status
      if (response.ok) {
        await this.markDeliverySuccess(deliveryId, config.id);
        return true;
      }

      // Non-2xx response
      const errorBody = await response.text().catch(() => '');
      await this.markDeliveryFailure(
        deliveryId,
        config.id,
        delivery.attemptCount + 1,
        `HTTP ${response.status}: ${errorBody.slice(0, 500)}`,
        response.status
      );
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.markDeliveryFailure(
        deliveryId,
        config.id,
        delivery.attemptCount + 1,
        message
      );
      return false;
    }
  }

  /**
   * Mark delivery as successful
   */
  private async markDeliverySuccess(deliveryId: string, webhookId: string): Promise<void> {
    const now = new Date();

    await db
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        deliveredAt: now,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    // Reset failure count on webhook config
    await db
      .update(webhookConfigs)
      .set({
        failedAttempts: 0,
        lastSucceededAt: now,
        updatedAt: now,
      })
      .where(eq(webhookConfigs.id, webhookId));
  }

  /**
   * Mark delivery as failed and schedule retry
   */
  private async markDeliveryFailure(
    deliveryId: string,
    webhookId: string,
    attemptCount: number,
    error: string,
    responseStatus?: number
  ): Promise<void> {
    const now = new Date();

    // Check if we should retry
    if (attemptCount >= WEBHOOK_SETTINGS.MAX_RETRIES) {
      await this.markDeliveryStatus(deliveryId, 'exhausted', error, responseStatus);
      await this.handleWebhookExhaustion(webhookId);
      return;
    }

    // Calculate exponential backoff
    const backoffMs = Math.min(
      WEBHOOK_SETTINGS.INITIAL_BACKOFF_MS * Math.pow(WEBHOOK_SETTINGS.BACKOFF_MULTIPLIER, attemptCount - 1),
      WEBHOOK_SETTINGS.MAX_BACKOFF_MS
    );
    const nextRetryAt = new Date(now.getTime() + backoffMs);

    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        lastError: error,
        lastResponseStatus: responseStatus,
        nextRetryAt,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    // Increment failure count on webhook config
    await db
      .update(webhookConfigs)
      .set({
        failedAttempts: sql`${webhookConfigs.failedAttempts} + 1`,
        lastFailedAt: now,
        updatedAt: now,
      })
      .where(eq(webhookConfigs.id, webhookId));
  }

  /**
   * Mark delivery with a status
   */
  private async markDeliveryStatus(
    deliveryId: string,
    status: WebhookDeliveryStatus,
    error?: string,
    responseStatus?: number
  ): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status,
        lastError: error,
        lastResponseStatus: responseStatus,
        nextRetryAt: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  }

  /**
   * Handle webhook exhaustion (all retries used)
   */
  private async handleWebhookExhaustion(webhookId: string): Promise<void> {
    // Get current failure count
    const configs = await db
      .select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.id, webhookId))
      .limit(1);

    const config = configs[0];
    if (!config) return;

    // Disable webhook if too many consecutive failures
    if (config.failedAttempts >= WEBHOOK_SETTINGS.MAX_CONSECUTIVE_FAILURES) {
      await db
        .update(webhookConfigs)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(webhookConfigs.id, webhookId));

      console.warn(`[Webhook] Disabled webhook ${webhookId} due to consecutive failures`);
    }
  }

  /**
   * Get pending deliveries for retry
   */
  async getPendingDeliveries(limit: number = 100) {
    const now = new Date();

    return db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, 'failed'),
          lt(webhookDeliveries.nextRetryAt, now),
          isNotNull(webhookDeliveries.nextRetryAt)
        )
      )
      .limit(limit);
  }

  /**
   * Get delivery history for an account
   */
  async getDeliveryHistory(
    accountId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    const config = await this.getConfig(accountId);
    if (!config) return [];

    return db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, config.id))
      .orderBy(webhookDeliveries.createdAt)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Send a test webhook
   */
  async sendTestWebhook(accountId: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTimeMs?: number;
    error?: string;
    requestId: string;
  }> {
    const config = await this.getConfig(accountId);
    if (!config) {
      return {
        success: false,
        error: 'Webhook not configured',
        requestId: '',
      };
    }

    const requestId = `test_${randomBytes(16).toString('hex')}`;
    const testPayload: WebhookPayload = {
      eventType: 'message.sent',
      accountId,
      timestamp: new Date().toISOString(),
      requestId,
      data: {
        messageSid: 'test_message_id',
        status: 'sent',
        test: true,
      },
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = WebhookService.signPayload(testPayload, config.secret, timestamp);

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        WEBHOOK_SETTINGS.REQUEST_TIMEOUT_MS
      );

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChatUncle-Signature': signature,
          'X-ChatUncle-Request-Id': requestId,
          'X-ChatUncle-Timestamp': timestamp.toString(),
        },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTimeMs = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        responseTimeMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        requestId,
      };
    } catch (error) {
      return {
        success: false,
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      };
    }
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// Singleton instance
export const webhookService = new WebhookService();
