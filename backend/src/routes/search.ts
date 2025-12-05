import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Global search across messages, contacts, and conversations
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, type, accountId, limit = 50 } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!q || (q as string).length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const searchTerm = `%${(q as string).toLowerCase()}%`;
    const limitNum = Math.min(parseInt(limit as string), 100);

    let accountFilter = '';
    const baseParams: any[] = [searchTerm, limitNum];
    let paramOffset = 2;

    if (accountId) {
      baseParams.push(accountId);
      accountFilter = `AND wa.id = $${++paramOffset}`;
    } else if (!isAdmin) {
      baseParams.push(userId);
      accountFilter = `AND wa.user_id = $${++paramOffset}`;
    }

    const results: any = {};

    // Search messages
    if (!type || type === 'messages') {
      const messages = await query(`
        SELECT
          m.id,
          m.content,
          m.content_type,
          m.sender_type,
          m.created_at,
          c.id as conversation_id,
          ct.name as contact_name,
          ct.phone_number as contact_phone,
          wa.name as account_name
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN contacts ct ON c.contact_id = ct.id
        JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
        WHERE LOWER(m.content) LIKE $1 ${accountFilter}
        ORDER BY m.created_at DESC
        LIMIT $2
      `, baseParams);

      results.messages = messages;
    }

    // Search contacts
    if (!type || type === 'contacts') {
      const contacts = await query(`
        SELECT
          ct.id,
          ct.name,
          ct.phone_number,
          ct.wa_id,
          ct.profile_pic_url,
          wa.name as account_name,
          wa.id as account_id
        FROM contacts ct
        JOIN whatsapp_accounts wa ON ct.whatsapp_account_id = wa.id
        WHERE (LOWER(ct.name) LIKE $1 OR ct.phone_number LIKE $1 OR ct.wa_id LIKE $1) ${accountFilter}
        ORDER BY ct.name ASC
        LIMIT $2
      `, baseParams);

      results.contacts = contacts;
    }

    // Search conversations (by contact name or last message)
    if (!type || type === 'conversations') {
      const conversations = await query(`
        SELECT DISTINCT ON (c.id)
          c.id,
          c.last_message_at,
          c.unread_count,
          ct.name as contact_name,
          ct.phone_number as contact_phone,
          wa.name as account_name,
          wa.id as account_id,
          (
            SELECT content FROM messages
            WHERE conversation_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
          ) as last_message
        FROM conversations c
        JOIN contacts ct ON c.contact_id = ct.id
        JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
        WHERE (LOWER(ct.name) LIKE $1 OR ct.phone_number LIKE $1) ${accountFilter}
        ORDER BY c.id, c.last_message_at DESC
        LIMIT $2
      `, baseParams);

      results.conversations = conversations;
    }

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Search within a specific conversation
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { q, limit = 50 } = req.query;
    const userId = req.user!.userId;

    if (!q || (q as string).length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    // Verify ownership
    const conversation = await query(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, userId]);

    if (conversation.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const searchTerm = `%${(q as string).toLowerCase()}%`;
    const limitNum = Math.min(parseInt(limit as string), 100);

    const messages = await query(`
      SELECT
        m.id,
        m.content,
        m.content_type,
        m.sender_type,
        m.created_at,
        m.status
      FROM messages m
      WHERE m.conversation_id = $1 AND LOWER(m.content) LIKE $2
      ORDER BY m.created_at DESC
      LIMIT $3
    `, [conversationId, searchTerm, limitNum]);

    res.json({ messages });
  } catch (error) {
    console.error('Conversation search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
