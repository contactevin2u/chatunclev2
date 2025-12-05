import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { ScheduledMessage } from '../types';

const router = Router();

router.use(authenticate);

// Get scheduled messages for a conversation
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await query<ScheduledMessage>(`
      SELECT sm.*, u.name as agent_name
      FROM scheduled_messages sm
      LEFT JOIN users u ON sm.agent_id = u.id
      WHERE sm.conversation_id = $1
      ORDER BY sm.scheduled_at ASC
    `, [conversationId]);

    res.json({ scheduled_messages: messages });
  } catch (error) {
    console.error('Get scheduled messages error:', error);
    res.status(500).json({ error: 'Failed to get scheduled messages' });
  }
});

// Get all pending scheduled messages for user
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const messages = await query(`
      SELECT sm.*, ct.name as contact_name, ct.phone_number as contact_phone
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE wa.user_id = $1 AND sm.status = 'pending'
      ORDER BY sm.scheduled_at ASC
    `, [userId]);

    res.json({ scheduled_messages: messages });
  } catch (error) {
    console.error('Get pending scheduled messages error:', error);
    res.status(500).json({ error: 'Failed to get pending scheduled messages' });
  }
});

// Create scheduled message
router.post('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { content, contentType = 'text', mediaUrl, mediaMimeType, scheduledAt } = req.body;
    const userId = req.user!.userId;

    if (!content || !scheduledAt) {
      res.status(400).json({ error: 'Content and scheduledAt are required' });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      res.status(400).json({ error: 'Scheduled time must be in the future' });
      return;
    }

    // Verify ownership
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const message = await queryOne<ScheduledMessage>(`
      INSERT INTO scheduled_messages (conversation_id, agent_id, content_type, content, media_url, media_mime_type, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [conversationId, userId, contentType, content, mediaUrl, mediaMimeType, scheduledDate]);

    res.status(201).json({ scheduled_message: message });
  } catch (error) {
    console.error('Create scheduled message error:', error);
    res.status(500).json({ error: 'Failed to create scheduled message' });
  }
});

// Update scheduled message
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, scheduledAt } = req.body;
    const userId = req.user!.userId;

    // Verify ownership and status
    const existing = await queryOne(`
      SELECT sm.id, sm.status
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE sm.id = $1 AND (sm.agent_id = $2 OR wa.user_id = $2)
    `, [id, userId]);

    if (!existing) {
      res.status(404).json({ error: 'Scheduled message not found' });
      return;
    }

    if (existing.status !== 'pending') {
      res.status(400).json({ error: 'Cannot modify non-pending message' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    if (content) {
      params.push(content);
      updates.push(`content = $${paramIndex++}`);
    }
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        res.status(400).json({ error: 'Scheduled time must be in the future' });
        return;
      }
      params.push(scheduledDate);
      updates.push(`scheduled_at = $${paramIndex++}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const message = await queryOne<ScheduledMessage>(`
      UPDATE scheduled_messages
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    res.json({ scheduled_message: message });
  } catch (error) {
    console.error('Update scheduled message error:', error);
    res.status(500).json({ error: 'Failed to update scheduled message' });
  }
});

// Cancel scheduled message
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Verify ownership
    const existing = await queryOne(`
      SELECT sm.id, sm.status
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE sm.id = $1 AND (sm.agent_id = $2 OR wa.user_id = $2)
    `, [id, userId]);

    if (!existing) {
      res.status(404).json({ error: 'Scheduled message not found' });
      return;
    }

    if (existing.status !== 'pending') {
      res.status(400).json({ error: 'Cannot cancel non-pending message' });
      return;
    }

    await execute(`
      UPDATE scheduled_messages SET status = 'cancelled' WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel scheduled message error:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

export default router;
