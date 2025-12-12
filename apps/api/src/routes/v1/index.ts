import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, accountAccessMiddleware } from '../../middleware/auth.js';
import { asyncHandler, sendSuccess, sendCreated, AppError } from '../../middleware/error-handler.js';
import { rateLimiter, endpointRateLimiter } from '../../middleware/rate-limiter.js';
import type { RequestWithContext } from '../../middleware/request-context.js';
import { idempotencyService } from '../../services/idempotency.js';
import { validityService } from '../../services/validity.js';
import { webhookService } from '../../services/webhooks.js';
import { conversationStateService } from '../../services/conversation-state.js';
import { errorMapper } from '../../services/error-mapper.js';
import type { SendMessageParams, ContentType, ChannelType } from '@chatuncle/shared';

const router = Router();

// Apply authentication to all v1 routes
router.use(authMiddleware);

// Apply rate limiting
router.use(rateLimiter('free'));

// ============================================
// TWILIO-STYLE MESSAGE ENDPOINTS
// ============================================

const sendMessageSchema = z.object({
  // Required
  To: z.string().min(1, { message: 'To (recipient) is required' }),
  From: z.string().uuid({ message: 'From (accountId) must be a valid UUID' }),
  Body: z.string().optional(),
  MediaUrl: z.string().url().optional(),

  // Optional Twilio-like params
  IdempotencyKey: z.string().max(64).optional(),
  ValidityPeriod: z.number().int().min(60).max(36000).optional(),
  SendAt: z.string().datetime().optional(),
  StatusCallback: z.string().url().optional(),

  // Extended params
  ContentType: z.enum(['text', 'image', 'video', 'audio', 'document', 'sticker', 'location']).optional(),
  ReplyToMessageId: z.string().optional(),
});

/**
 * POST /v1/Messages
 * Send a message (Twilio-compatible)
 */
router.post(
  '/Messages',
  endpointRateLimiter(60000, 50), // 50 messages per minute
  asyncHandler(async (req, res) => {
    const contextReq = req as RequestWithContext;
    const data = sendMessageSchema.parse(req.body);

    // Check idempotency
    if (data.IdempotencyKey) {
      const idempotencyResult = await idempotencyService.check(
        data.From,
        data.IdempotencyKey,
        req.body
      );

      if (idempotencyResult.isDuplicate) {
        return sendSuccess(res, {
          ...(idempotencyResult.cachedResponse as object),
          cached: true,
        });
      }
    }

    // Validate content
    if (!data.Body && !data.MediaUrl) {
      throw new AppError('MISSING_CONTENT', 'Either Body or MediaUrl is required');
    }

    // Calculate expiration
    const expiresAt = validityService.calculateExpiry(data.ValidityPeriod);

    // Build response (in a real implementation, this would call the message service)
    const messageResponse = {
      sid: `SM${generateSid()}`,
      accountSid: data.From,
      to: data.To,
      from: data.From,
      body: data.Body,
      status: 'queued',
      dateCreated: new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      direction: 'outbound-api',
      errorCode: null,
      errorMessage: null,
    };

    // Store idempotency response
    if (data.IdempotencyKey) {
      await idempotencyService.store(
        data.From,
        data.IdempotencyKey,
        req.body,
        messageResponse
      );
    }

    sendCreated(res, messageResponse);
  })
);

/**
 * GET /v1/Messages/:messageSid
 * Get message details
 */
router.get(
  '/Messages/:messageSid',
  asyncHandler(async (req, res) => {
    // In a real implementation, this would look up the message
    sendSuccess(res, {
      sid: req.params.messageSid,
      status: 'delivered',
      dateCreated: new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
    });
  })
);

// ============================================
// TWILIO-STYLE ACCOUNT ENDPOINTS
// ============================================

/**
 * GET /v1/Accounts
 * List accounts
 */
router.get(
  '/Accounts',
  asyncHandler(async (req, res) => {
    // Placeholder - would call accounts service
    sendSuccess(res, {
      accounts: [],
      pagination: {
        page: 0,
        pageSize: 50,
        total: 0,
      },
    });
  })
);

/**
 * GET /v1/Accounts/:accountSid
 * Get account details
 */
router.get(
  '/Accounts/:accountSid',
  accountAccessMiddleware(),
  asyncHandler(async (req, res) => {
    sendSuccess(res, {
      sid: req.params.accountSid,
      friendlyName: 'Account',
      status: 'active',
      dateCreated: new Date().toISOString(),
    });
  })
);

// ============================================
// TWILIO-STYLE CONVERSATION ENDPOINTS
// ============================================

const updateConversationStateSchema = z.object({
  State: z.enum(['active', 'inactive', 'closed']),
  Reason: z.string().optional(),
});

/**
 * GET /v1/Conversations
 * List conversations
 */
router.get(
  '/Conversations',
  asyncHandler(async (req, res) => {
    const accountId = req.query.AccountSid as string;
    const state = req.query.State as string;
    const limit = Math.min(parseInt(req.query.PageSize as string) || 50, 100);

    sendSuccess(res, {
      conversations: [],
      meta: {
        page: 0,
        pageSize: limit,
        total: 0,
      },
    });
  })
);

/**
 * GET /v1/Conversations/:conversationSid
 * Get conversation details
 */
router.get(
  '/Conversations/:conversationSid',
  asyncHandler(async (req, res) => {
    const stateInfo = await conversationStateService.getStateInfo(req.params.conversationSid);

    if (!stateInfo) {
      throw new AppError('INVALID_RECIPIENT', 'Conversation not found');
    }

    sendSuccess(res, {
      sid: req.params.conversationSid,
      state: stateInfo.currentState,
      stateChangedAt: stateInfo.stateChangedAt,
      closedAt: stateInfo.closedAt,
      closedReason: stateInfo.closedReason,
      timers: stateInfo.timers,
    });
  })
);

/**
 * POST /v1/Conversations/:conversationSid/State
 * Update conversation state
 */
router.post(
  '/Conversations/:conversationSid/State',
  asyncHandler(async (req, res) => {
    const contextReq = req as RequestWithContext;
    const data = updateConversationStateSchema.parse(req.body);

    const success = await conversationStateService.changeState(
      req.params.conversationSid,
      data.State,
      data.Reason as any || 'manual_close',
      'agent',
      contextReq.userId
    );

    if (!success) {
      throw new AppError('DELIVERY_FAILED', 'Failed to update conversation state');
    }

    const stateInfo = await conversationStateService.getStateInfo(req.params.conversationSid);

    sendSuccess(res, {
      sid: req.params.conversationSid,
      state: stateInfo?.currentState,
      stateChangedAt: stateInfo?.stateChangedAt,
    });
  })
);

/**
 * GET /v1/Conversations/:conversationSid/State/History
 * Get conversation state history
 */
router.get(
  '/Conversations/:conversationSid/State/History',
  asyncHandler(async (req, res) => {
    const stateInfo = await conversationStateService.getStateInfo(req.params.conversationSid);

    if (!stateInfo) {
      throw new AppError('INVALID_RECIPIENT', 'Conversation not found');
    }

    sendSuccess(res, {
      conversationSid: req.params.conversationSid,
      history: stateInfo.history,
    });
  })
);

/**
 * POST /v1/Conversations/:conversationSid/Timers/Reset
 * Reset conversation timers
 */
router.post(
  '/Conversations/:conversationSid/Timers/Reset',
  asyncHandler(async (req, res) => {
    await conversationStateService.resetTimers(req.params.conversationSid);

    sendSuccess(res, {
      success: true,
      message: 'Timers reset',
    });
  })
);

// ============================================
// WEBHOOK ENDPOINTS (Twilio-style)
// ============================================

/**
 * GET /v1/Accounts/:accountSid/Webhooks
 * Get webhook configuration
 */
router.get(
  '/Accounts/:accountSid/Webhooks',
  accountAccessMiddleware(),
  asyncHandler(async (req, res) => {
    const config = await webhookService.getConfig(req.params.accountSid);

    if (!config) {
      return sendSuccess(res, {
        configured: false,
      });
    }

    const { secret, ...safeConfig } = config;
    sendSuccess(res, {
      configured: true,
      webhook: safeConfig,
    });
  })
);

// ============================================
// UTILITY ENDPOINTS
// ============================================

/**
 * GET /v1/Health
 * Health check
 */
router.get('/Health', (_req, res) => {
  sendSuccess(res, {
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a Twilio-style SID
 */
function generateSid(): string {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default router;
