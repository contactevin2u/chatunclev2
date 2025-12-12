import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { getMessages, sendMessage, getMessageById } from './service.js';
import { getConversationById } from '../conversations/service.js';
import { userHasAccountAccess } from '../accounts/access.js';

const router = Router();

router.use(authMiddleware);

const getMessagesSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
});

const sendMessageSchema = z.object({
  contentType: z.enum(['text', 'image', 'video', 'audio', 'document', 'sticker', 'location']),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaMimeType: z.string().optional(),
  replyToMessageId: z.string().optional(),
  tempId: z.string().optional(),
});

/**
 * GET /api/conversations/:conversationId/messages
 * Get messages for a conversation
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const query = getMessagesSchema.parse(req.query);

    // Get conversation to check access
    const conversation = await getConversationById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await getMessages({
      conversationId: req.params.conversationId,
      limit: query.limit,
      before: query.before,
      after: query.after,
    });

    res.json({
      messages: result.messages,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Messages] Get error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/conversations/:conversationId/messages
 * Send a message
 */
router.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const data = sendMessageSchema.parse(req.body);

    // Get conversation to check access
    const conversation = await getConversationById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate content
    if (data.contentType === 'text' && !data.content) {
      return res.status(400).json({ error: 'Content required for text messages' });
    }

    if (['image', 'video', 'audio', 'document', 'sticker'].includes(data.contentType) && !data.mediaUrl) {
      return res.status(400).json({ error: 'Media URL required for media messages' });
    }

    const result = await sendMessage({
      accountId: conversation.accountId,
      conversationId: req.params.conversationId,
      contentType: data.contentType,
      content: data.content,
      mediaUrl: data.mediaUrl,
      mediaMimeType: data.mediaMimeType,
      replyToMessageId: data.replyToMessageId,
      agentId: req.user!.userId,
      tempId: data.tempId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ message: result.message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Messages] Send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * GET /api/messages/:messageId
 * Get a single message
 */
router.get('/messages/:messageId', async (req, res) => {
  try {
    const message = await getMessageById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get conversation to check access
    const conversation = await getConversationById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, conversation.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ message });
  } catch (error) {
    console.error('[Messages] Get error:', error);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

export default router;
