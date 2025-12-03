import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { Template } from '../types';

const router = Router();

router.use(authenticate);

// List user's templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await query<Template>(
      'SELECT * FROM templates WHERE user_id = $1 ORDER BY name ASC',
      [req.user!.userId]
    );

    res.json({ templates });
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Create template
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, content, shortcut } = req.body;

    if (!name || !content) {
      res.status(400).json({ error: 'Name and content are required' });
      return;
    }

    const template = await queryOne<Template>(
      `INSERT INTO templates (user_id, name, content, shortcut)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user!.userId, name, content, shortcut]
    );

    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, content, shortcut } = req.body;

    const existing = await queryOne<Template>(
      'SELECT * FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const template = await queryOne<Template>(
      `UPDATE templates
       SET name = COALESCE($1, name),
           content = COALESCE($2, content),
           shortcut = COALESCE($3, shortcut)
       WHERE id = $4
       RETURNING *`,
      [name, content, shortcut, req.params.id]
    );

    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const rowsDeleted = await execute(
      'DELETE FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (rowsDeleted === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
