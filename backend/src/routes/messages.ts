import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { Message } from '../types';

const router = Router();

router.use(authenticate);

// Get messages for a conversation
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { limit = 50, before } = req.query;

    // Verify ownership
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, ct.wa_id
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.conversationId, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    let sql = `
      SELECT m.id, m.wa_message_id, m.sender_type, m.content_type, m.content,
             m.media_url, m.media_mime_type, m.status, m.created_at,
             m.agent_id, m.is_auto_reply, m.response_time_ms,
             u.name as agent_name
      FROM messages m
      LEFT JOIN users u ON m.agent_id = u.id
      WHERE m.conversation_id = $1
    `;
    const params: any[] = [req.params.conversationId];

    if (before) {
      params.push(before);
      sql += ` AND m.created_at < $${params.length}`;
    }

    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

    const messages = await query<Message>(sql, params);

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { content, contentType = 'text', mediaUrl, mediaMimeType } = req.body;
    const agentId = req.user!.userId;

    // Verify ownership and get details
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, ct.wa_id, c.first_response_at
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.conversationId, agentId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Calculate response time (time since last contact message)
    const lastContactMessage = await queryOne(`
      SELECT created_at FROM messages
      WHERE conversation_id = $1 AND sender_type = 'contact'
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.params.conversationId]);

    const responseTimeMs = lastContactMessage
      ? Date.now() - new Date(lastContactMessage.created_at).getTime()
      : null;

    // Send via WhatsApp
    const waMessageId = await sessionManager.sendMessage(
      conversation.whatsapp_account_id,
      conversation.wa_id,
      {
        type: contentType,
        content,
        mediaUrl,
        mediaMimeType,
      }
    );

    // Save to database with agent tracking
    const message = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id, response_time_ms)
      VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent', $7, $8)
      RETURNING *
    `, [req.params.conversationId, waMessageId, contentType, content, mediaUrl, mediaMimeType, agentId, responseTimeMs]);

    // Update conversation (including first response time if not set)
    await execute(`
      UPDATE conversations
      SET last_message_at = NOW(),
          updated_at = NOW(),
          first_response_at = COALESCE(first_response_at, NOW()),
          assigned_agent_id = COALESCE(assigned_agent_id, $2)
      WHERE id = $1
    `, [req.params.conversationId, agentId]);

    // Log agent activity
    await execute(`
      INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
      VALUES ($1, 'message_sent', 'conversation', $2, $3)
    `, [agentId, req.params.conversationId, JSON.stringify({ content_type: contentType, response_time_ms: responseTimeMs })]);

    // Get agent name for response
    const agent = await queryOne('SELECT name FROM users WHERE id = $1', [agentId]);

    res.status(201).json({
      message: {
        ...message,
        agent_name: agent?.name,
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
