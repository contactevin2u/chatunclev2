import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { Label } from '../types';

const router = Router();

router.use(authenticate);

// List user's labels
router.get('/', async (req: Request, res: Response) => {
  try {
    const labels = await query<Label>(
      'SELECT * FROM labels WHERE user_id = $1 ORDER BY name ASC',
      [req.user!.userId]
    );

    res.json({ labels });
  } catch (error) {
    console.error('List labels error:', error);
    res.status(500).json({ error: 'Failed to list labels' });
  }
});

// Create label
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color = '#3B82F6' } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const label = await queryOne<Label>(
      `INSERT INTO labels (user_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user!.userId, name, color]
    );

    res.status(201).json({ label });
  } catch (error) {
    console.error('Create label error:', error);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// Update label
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    const existing = await queryOne<Label>(
      'SELECT * FROM labels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!existing) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    const label = await queryOne<Label>(
      `UPDATE labels SET name = COALESCE($1, name), color = COALESCE($2, color)
       WHERE id = $3
       RETURNING *`,
      [name, color, req.params.id]
    );

    res.json({ label });
  } catch (error) {
    console.error('Update label error:', error);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// Delete label
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const rowsDeleted = await execute(
      'DELETE FROM labels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (rowsDeleted === 0) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    res.json({ message: 'Label deleted' });
  } catch (error) {
    console.error('Delete label error:', error);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

export default router;
