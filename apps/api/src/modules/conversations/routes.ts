import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, accountAccessMiddleware } from '../../middleware/auth.js';
import {
  getConversations,
  getConversationById,
  markConversationRead,
  assignAgent,
  getUnifiedInbox,
} from './service.js';
import { getUserAccountAccess } from '../accounts/access.js';

const router = Router();

router.use(authMiddleware);

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  isGroup: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  assignedAgentId: z.string().uuid().optional(),
  unreadOnly: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
});

const inboxQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  isGroup: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  assignedAgentId: z.string().uuid().optional(),
  unreadOnly: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  channelType: z.enum(['whatsapp', 'telegram', 'tiktok', 'instagram', 'messenger']).optional(),
});

const assignAgentSchema = z.object({
  agentId: z.string().uuid().nullable(),
});

/**
 * GET /api/inbox
 * Get unified inbox - conversations across ALL accounts user has access to
 */
router.get('/inbox', async (req, res) => {
  try {
    const query = inboxQuerySchema.parse(req.query);

    // Get all accounts the user has access to
    const accountIds = await getUserAccountAccess(req.user!.userId);

    if (accountIds.length === 0) {
      return res.json({
        conversations: [],
        total: 0,
        page: query.page,
        limit: query.limit,
        totalPages: 0,
      });
    }

    const result = await getUnifiedInbox({
      accountIds,
      page: query.page,
      limit: query.limit,
      isGroup: query.isGroup,
      assignedAgentId: query.assignedAgentId,
      unreadOnly: query.unreadOnly,
      channelType: query.channelType,
    });

    res.json({
      conversations: result.conversations,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Inbox] List error:', error);
    res.status(500).json({ error: 'Failed to get inbox' });
  }
});

/**
 * GET /api/accounts/:accountId/conversations
 * Get conversations for an account
 */
router.get('/accounts/:accountId/conversations', accountAccessMiddleware(), async (req, res) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const result = await getConversations({
      accountId: req.params.accountId,
      page: query.page,
      limit: query.limit,
      isGroup: query.isGroup,
      assignedAgentId: query.assignedAgentId,
      unreadOnly: query.unreadOnly,
    });

    res.json({
      conversations: result.conversations,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Conversations] List error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Get a single conversation
 */
router.get('/conversations/:conversationId', async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check access
    const { userHasAccountAccess } = await import('../accounts/access.js');
    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ conversation });
  } catch (error) {
    console.error('[Conversations] Get error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * POST /api/conversations/:conversationId/read
 * Mark conversation as read
 */
router.post('/conversations/:conversationId/read', async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check access
    const { userHasAccountAccess } = await import('../accounts/access.js');
    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await markConversationRead(req.params.conversationId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to mark as read' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Conversations] Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

/**
 * PATCH /api/conversations/:conversationId/assign
 * Assign/unassign agent to conversation
 */
router.patch('/conversations/:conversationId/assign', async (req, res) => {
  try {
    const data = assignAgentSchema.parse(req.body);
    const conversation = await getConversationById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check access
    const { userHasAccountAccess } = await import('../accounts/access.js');
    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await assignAgent(req.params.conversationId, data.agentId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to assign agent' });
    }

    res.json({ success: true, assignedAgentId: data.agentId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Conversations] Assign error:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

export default router;
