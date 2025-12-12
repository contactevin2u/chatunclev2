import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, accountAccessMiddleware, roleMiddleware } from '../../middleware/auth.js';
import { asyncHandler, AppError, sendSuccess, sendCreated, sendNoContent } from '../../middleware/error-handler.js';
import type { RequestWithContext } from '../../middleware/request-context.js';
import { webhookService } from '../../services/webhooks.js';
import type { WebhookEventType } from '@chatuncle/shared';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Valid webhook event types
const VALID_EVENTS: WebhookEventType[] = [
  'message.queued',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'message.expired',
  'conversation.created',
  'conversation.state_changed',
  'conversation.timer_fired',
  'conversation.assigned',
  'message.received',
  'account.connected',
  'account.disconnected',
  'account.error',
];

// Validation schemas
const createWebhookSchema = z.object({
  url: z.string().url({ message: 'Valid URL is required' }),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1, { message: 'At least one event is required' }),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/accounts/:accountId/webhooks
 * Get webhook configuration for an account
 */
router.get(
  '/:accountId/webhooks',
  accountAccessMiddleware(),
  asyncHandler(async (req, res) => {
    const config = await webhookService.getConfig(req.params.accountId);

    if (!config) {
      return sendSuccess(res, {
        configured: false,
        webhook: null,
      });
    }

    // Don't expose the secret
    const { secret, ...safeConfig } = config;
    sendSuccess(res, {
      configured: true,
      webhook: {
        ...safeConfig,
        secretPreview: `${secret.slice(0, 8)}...${secret.slice(-4)}`,
      },
    });
  })
);

/**
 * POST /api/accounts/:accountId/webhooks
 * Create webhook configuration
 */
router.post(
  '/:accountId/webhooks',
  accountAccessMiddleware(),
  roleMiddleware(['owner', 'admin']),
  asyncHandler(async (req, res) => {
    // Check if webhook already exists
    const existing = await webhookService.getConfig(req.params.accountId);
    if (existing) {
      throw new AppError('INVALID_CONTENT_TYPE', 'Webhook already configured. Use PATCH to update.');
    }

    const data = createWebhookSchema.parse(req.body);

    const config = await webhookService.createConfig(
      req.params.accountId,
      data.url,
      data.events as WebhookEventType[]
    );

    // Return with secret (only on create)
    sendCreated(res, {
      webhook: config,
      message: 'Webhook created. Save the secret - it will not be shown again.',
    });
  })
);

/**
 * PATCH /api/accounts/:accountId/webhooks
 * Update webhook configuration
 */
router.patch(
  '/:accountId/webhooks',
  accountAccessMiddleware(),
  roleMiddleware(['owner', 'admin']),
  asyncHandler(async (req, res) => {
    const existing = await webhookService.getConfig(req.params.accountId);
    if (!existing) {
      throw new AppError('INVALID_RECIPIENT', 'Webhook not configured');
    }

    const data = updateWebhookSchema.parse(req.body);

    const config = await webhookService.updateConfig(req.params.accountId, {
      url: data.url,
      events: data.events as WebhookEventType[] | undefined,
      isActive: data.isActive,
    });

    const { secret, ...safeConfig } = config!;
    sendSuccess(res, {
      webhook: {
        ...safeConfig,
        secretPreview: `${secret.slice(0, 8)}...${secret.slice(-4)}`,
      },
    });
  })
);

/**
 * DELETE /api/accounts/:accountId/webhooks
 * Delete webhook configuration
 */
router.delete(
  '/:accountId/webhooks',
  accountAccessMiddleware(),
  roleMiddleware(['owner', 'admin']),
  asyncHandler(async (req, res) => {
    await webhookService.deleteConfig(req.params.accountId);
    sendNoContent(res);
  })
);

/**
 * POST /api/accounts/:accountId/webhooks/regenerate-secret
 * Regenerate webhook secret
 */
router.post(
  '/:accountId/webhooks/regenerate-secret',
  accountAccessMiddleware(),
  roleMiddleware(['owner', 'admin']),
  asyncHandler(async (req, res) => {
    const existing = await webhookService.getConfig(req.params.accountId);
    if (!existing) {
      throw new AppError('INVALID_RECIPIENT', 'Webhook not configured');
    }

    const newSecret = await webhookService.regenerateSecret(req.params.accountId);

    sendSuccess(res, {
      secret: newSecret,
      message: 'Secret regenerated. Save it - it will not be shown again.',
    });
  })
);

/**
 * POST /api/accounts/:accountId/webhooks/test
 * Send a test webhook
 */
router.post(
  '/:accountId/webhooks/test',
  accountAccessMiddleware(),
  asyncHandler(async (req, res) => {
    const result = await webhookService.sendTestWebhook(req.params.accountId);

    sendSuccess(res, {
      test: result,
    });
  })
);

/**
 * GET /api/accounts/:accountId/webhooks/deliveries
 * Get webhook delivery history
 */
router.get(
  '/:accountId/webhooks/deliveries',
  accountAccessMiddleware(),
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const deliveries = await webhookService.getDeliveryHistory(
      req.params.accountId,
      limit,
      offset
    );

    sendSuccess(res, {
      deliveries,
      pagination: {
        limit,
        offset,
        hasMore: deliveries.length === limit,
      },
    });
  })
);

export default router;
