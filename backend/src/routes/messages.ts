import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
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
      SELECT id, wa_message_id, sender_type, content_type, content,
             media_url, media_mime_type, status, created_at
      FROM messages
      WHERE conversation_id = $1
    `;
    const params: any[] = [req.params.conversationId];

    if (before) {
      params.push(before);
      sql += ` AND created_at < $${params.length}`;
    }

    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

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

    // Verify ownership and get details
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

    // Save to database
    const message = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status)
      VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent')
      RETURNING *
    `, [req.params.conversationId, waMessageId, contentType, content, mediaUrl, mediaMimeType]);

    // Update conversation
    await queryOne(`
      UPDATE conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [req.params.conversationId]);

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
