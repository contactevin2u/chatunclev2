import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { ScheduledMessage } from '../types';

const router = Router();

router.use(authenticate);

// Get all scheduled messages for user (optionally filtered by conversationId)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.query;

    let messages;
    if (conversationId) {
      // Verify ownership and get for specific conversation
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

      messages = await query<ScheduledMessage>(`
        SELECT sm.*, u.name as agent_name, ct.name as contact_name, ct.phone_number as contact_phone
        FROM scheduled_messages sm
        LEFT JOIN users u ON sm.agent_id = u.id
        JOIN conversations c ON sm.conversation_id = c.id
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        WHERE sm.conversation_id = $1
        ORDER BY sm.scheduled_at ASC
      `, [conversationId]);
    } else {
      // Get all for user
      messages = await query(`
        SELECT sm.*, ct.name as contact_name, ct.phone_number as contact_phone
        FROM scheduled_messages sm
        JOIN conversations c ON sm.conversation_id = c.id
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
        WHERE wa.user_id = $1
        ORDER BY sm.scheduled_at DESC
      `, [userId]);
    }

    res.json({ scheduledMessages: messages });
  } catch (error) {
    console.error('Get scheduled messages error:', error);
    res.status(500).json({ error: 'Failed to get scheduled messages' });
  }
});

// Create scheduled message
router.post('/', async (req: Request, res: Response) => {
  try {
    const { conversationId, content, contentType = 'text', mediaUrl, mediaMimeType, scheduledAt } = req.body;
    const userId = req.user!.userId;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }

    if (!content && !mediaUrl) {
      res.status(400).json({ error: 'Content or media is required' });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({ error: 'scheduledAt is required' });
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
    `, [conversationId, userId, contentType, content || '', mediaUrl, mediaMimeType, scheduledDate]);

    res.status(201).json({ scheduledMessage: message });
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

// Cancel scheduled message (POST /api/scheduled-messages/:id/cancel)
router.post('/:id/cancel', async (req: Request, res: Response) => {
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

    const message = await queryOne(`
      UPDATE scheduled_messages SET status = 'cancelled' WHERE id = $1 RETURNING *
    `, [id]);

    res.json({ scheduledMessage: message });
  } catch (error) {
    console.error('Cancel scheduled message error:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

// Delete scheduled message (DELETE /api/scheduled-messages/:id)
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

    await execute(`DELETE FROM scheduled_messages WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete scheduled message error:', error);
    res.status(500).json({ error: 'Failed to delete scheduled message' });
  }
});

export default router;
