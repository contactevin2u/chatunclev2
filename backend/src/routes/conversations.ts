import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// List conversations for user's accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, unreadOnly } = req.query;

    let sql = `
      SELECT
        c.id,
        c.whatsapp_account_id,
        c.contact_id,
        c.last_message_at,
        c.unread_count,
        c.created_at,
        ct.wa_id,
        ct.name as contact_name,
        ct.phone_number as contact_phone,
        ct.profile_pic_url,
        wa.name as account_name,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE wa.user_id = $1
    `;

    const params: any[] = [req.user!.userId];

    if (accountId) {
      params.push(accountId);
      sql += ` AND c.whatsapp_account_id = $${params.length}`;
    }

    if (unreadOnly === 'true') {
      sql += ' AND c.unread_count > 0';
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    const conversations = await query(sql, params);

    res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Get single conversation with recent messages
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Get conversation with ownership check
    const conversation = await queryOne(`
      SELECT
        c.*,
        ct.wa_id,
        ct.name as contact_name,
        ct.phone_number as contact_phone,
        ct.profile_pic_url
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get labels for the contact
    const labels = await query(`
      SELECT l.id, l.name, l.color
      FROM labels l
      JOIN contact_labels cl ON l.id = cl.label_id
      WHERE cl.contact_id = $1
    `, [conversation.contact_id]);

    res.json({
      conversation: {
        ...conversation,
        labels
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Mark conversation as read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    // Verify ownership
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await execute(
      'UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
