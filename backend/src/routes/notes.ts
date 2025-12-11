import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { InternalNote } from '../types';

const router = Router();

router.use(authenticate);

// Get notes for a conversation
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership (including shared account access)
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const notes = await query<InternalNote & { agent_name: string }>(`
      SELECT n.*, u.name as agent_name
      FROM internal_notes n
      LEFT JOIN users u ON n.agent_id = u.id
      WHERE n.conversation_id = $1
      ORDER BY n.created_at DESC
    `, [conversationId]);

    res.json({ notes });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Create note
router.post('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    // Verify ownership (including shared account access)
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const note = await queryOne<InternalNote>(`
      INSERT INTO internal_notes (conversation_id, agent_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [conversationId, userId, content.trim()]);

    // Get agent name
    const agent = await queryOne('SELECT name FROM users WHERE id = $1', [userId]);

    res.status(201).json({
      note: {
        ...note,
        agent_name: agent?.name,
      }
    });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update note
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    // Verify ownership (only note creator can edit)
    const existing = await queryOne(`
      SELECT id FROM internal_notes WHERE id = $1 AND agent_id = $2
    `, [id, userId]);

    if (!existing) {
      res.status(404).json({ error: 'Note not found or not authorized' });
      return;
    }

    const note = await queryOne<InternalNote>(`
      UPDATE internal_notes
      SET content = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [content.trim(), id]);

    res.json({ note });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete note
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    // Verify ownership (note creator or admin can delete)
    let query_str = `SELECT id FROM internal_notes WHERE id = $1`;
    const params: any[] = [id];

    if (!isAdmin) {
      query_str += ` AND agent_id = $2`;
      params.push(userId);
    }

    const existing = await queryOne(query_str, params);

    if (!existing) {
      res.status(404).json({ error: 'Note not found or not authorized' });
      return;
    }

    await execute('DELETE FROM internal_notes WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export default router;
