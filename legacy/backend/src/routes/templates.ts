import { Router, Request, Response } from 'express';
import { query, queryOne, execute, transaction } from '../config/database';
import { authenticate } from '../middleware/auth';
import { executeSequence } from '../services/sequenceExecutor';
import { getAvailableVariables } from '../utils/templateVariables';

interface Template {
  id: string;
  user_id?: string;
  account_id?: string;
  whatsapp_account_id?: string;
  name: string;
  content: string;
  shortcut?: string;
  content_type: string;
  media_url?: string;
  media_mime_type?: string;
  created_at: string;
}

interface TemplateSequence {
  id: string;
  user_id?: string;
  account_id?: string;
  whatsapp_account_id?: string;
  name: string;
  description?: string;
  shortcut?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: TemplateSequenceItem[];
}

// Helper to check if user has access to an account (backward compatible)
async function userHasAccountAccess(userId: string, accountId: string): Promise<boolean> {
  const result = await queryOne(
    `SELECT 1 FROM accounts a
     LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
     WHERE a.id = $2 AND (a.user_id = $1 OR aa.agent_id IS NOT NULL)`,
    [userId, accountId]
  );
  return !!result;
}

interface TemplateSequenceItem {
  id: string;
  sequence_id: string;
  order_index: number;
  content_type: string;
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  created_at: string;
}

const router = Router();

router.use(authenticate);

// Get available template variables
router.get('/variables', (req: Request, res: Response) => {
  res.json({ variables: getAvailableVariables() });
});

// ============================================
// SIMPLE TEMPLATES (Quick Replies)
// ============================================

// List templates for an account (shared across all agents with access)
// Use ?accountId=xxx to get templates for a specific account
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (accountId) {
      // Check if user has access to this account
      if (!await userHasAccountAccess(req.user!.userId, accountId as string)) {
        res.status(403).json({ error: 'Access denied to this account' });
        return;
      }

      // Get templates for this account (shared) - use unified account_id
      const templates = await query<Template>(
        'SELECT * FROM templates WHERE account_id = $1 ORDER BY name ASC',
        [accountId]
      );
      res.json({ templates });
    } else {
      // Legacy: get all templates user has access to (own + shared accounts)
      // Backward compatible: uses unified accounts view
      const templates = await query<Template>(
        `SELECT DISTINCT t.* FROM templates t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
         WHERE t.user_id = $1
            OR a.user_id = $1
            OR aa.agent_id IS NOT NULL
         ORDER BY t.name ASC`,
        [req.user!.userId]
      );
      res.json({ templates });
    }
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Create template (with media support)
// Pass accountId to create a shared template for that account
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, content, shortcut, content_type, media_url, media_mime_type, accountId } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    // Check if user has access to this account
    if (!await userHasAccountAccess(req.user!.userId, accountId)) {
      res.status(403).json({ error: 'Access denied to this account' });
      return;
    }

    // Content is required for text templates
    if ((!content_type || content_type === 'text') && !content) {
      res.status(400).json({ error: 'Content is required for text templates' });
      return;
    }

    // Media URL is required for non-text templates
    if (content_type && content_type !== 'text' && !media_url) {
      res.status(400).json({ error: 'Media URL is required for media templates' });
      return;
    }

    const template = await queryOne<Template>(
      `INSERT INTO templates (account_id, user_id, name, content, shortcut, content_type, media_url, media_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        accountId,
        req.user!.userId,  // Track who created it
        name,
        content || '',
        shortcut || null,
        content_type || 'text',
        media_url || null,
        media_mime_type || null
      ]
    );

    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template (any agent with account access can update)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, content, shortcut, content_type, media_url, media_mime_type } = req.body;

    // Get template and check if user has access to its account
    const existing = await queryOne<Template>(
      'SELECT * FROM templates WHERE id = $1',
      [req.params.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Check access - either owns the template OR has access to the account
    const hasAccess = existing.user_id === req.user!.userId ||
      (existing.account_id && await userHasAccountAccess(req.user!.userId, existing.account_id));

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to this template' });
      return;
    }

    const template = await queryOne<Template>(
      `UPDATE templates
       SET name = COALESCE($1, name),
           content = COALESCE($2, content),
           shortcut = COALESCE($3, shortcut),
           content_type = COALESCE($4, content_type),
           media_url = COALESCE($5, media_url),
           media_mime_type = COALESCE($6, media_mime_type)
       WHERE id = $7
       RETURNING *`,
      [name, content, shortcut, content_type, media_url, media_mime_type, req.params.id]
    );

    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template (any agent with account access can delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Get template and check if user has access to its account
    const existing = await queryOne<Template>(
      'SELECT * FROM templates WHERE id = $1',
      [req.params.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Check access - either owns the template OR has access to the account
    const hasAccess = existing.user_id === req.user!.userId ||
      (existing.account_id && await userHasAccountAccess(req.user!.userId, existing.account_id));

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to this template' });
      return;
    }

    await execute('DELETE FROM templates WHERE id = $1', [req.params.id]);
    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// TEMPLATE SEQUENCES (Multi-part with delays)
// ============================================

// List template sequences for an account (shared across all agents with access)
// Use ?accountId=xxx to get sequences for a specific account
router.get('/sequences', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    let sequences: TemplateSequence[];

    if (accountId) {
      // Check if user has access to this account
      if (!await userHasAccountAccess(req.user!.userId, accountId as string)) {
        res.status(403).json({ error: 'Access denied to this account' });
        return;
      }

      sequences = await query<TemplateSequence>(
        'SELECT * FROM template_sequences WHERE account_id = $1 ORDER BY name ASC',
        [accountId]
      );
    } else {
      // Legacy: get all sequences user has access to (backward compatible)
      sequences = await query<TemplateSequence>(
        `SELECT DISTINCT ts.* FROM template_sequences ts
         LEFT JOIN accounts a ON ts.account_id = a.id
         LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
         WHERE ts.user_id = $1
            OR a.user_id = $1
            OR aa.agent_id IS NOT NULL
         ORDER BY ts.name ASC`,
        [req.user!.userId]
      );
    }

    // Batch fetch items for all sequences (fixes N+1 query)
    if (sequences.length > 0) {
      const sequenceIds = sequences.map(s => s.id);
      const allItems = await query<TemplateSequenceItem & { sequence_id: string }>(
        'SELECT * FROM template_sequence_items WHERE sequence_id = ANY($1) ORDER BY sequence_id, order_index ASC',
        [sequenceIds]
      );

      // Group items by sequence_id
      const itemsBySequence = new Map<string, TemplateSequenceItem[]>();
      for (const item of allItems) {
        const existing = itemsBySequence.get(item.sequence_id) || [];
        existing.push(item);
        itemsBySequence.set(item.sequence_id, existing);
      }

      // Attach items to sequences
      for (const seq of sequences) {
        seq.items = itemsBySequence.get(seq.id) || [];
      }
    }

    res.json({ sequences });
  } catch (error) {
    console.error('List sequences error:', error);
    res.status(500).json({ error: 'Failed to list sequences' });
  }
});

// Get single sequence with items
router.get('/sequences/:id', async (req: Request, res: Response) => {
  try {
    const sequence = await queryOne<TemplateSequence>(
      'SELECT * FROM template_sequences WHERE id = $1',
      [req.params.id]
    );

    if (!sequence) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }

    // Check access
    const hasAccess = sequence.user_id === req.user!.userId ||
      (sequence.account_id && await userHasAccountAccess(req.user!.userId, sequence.account_id));

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to this sequence' });
      return;
    }

    sequence.items = await query<TemplateSequenceItem>(
      'SELECT * FROM template_sequence_items WHERE sequence_id = $1 ORDER BY order_index ASC',
      [sequence.id]
    );

    res.json({ sequence });
  } catch (error) {
    console.error('Get sequence error:', error);
    res.status(500).json({ error: 'Failed to get sequence' });
  }
});

// Create template sequence with items
// Pass accountId to create a shared sequence for that account
router.post('/sequences', async (req: Request, res: Response) => {
  try {
    const { name, description, shortcut, items, accountId } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    // Check if user has access to this account
    if (!await userHasAccountAccess(req.user!.userId, accountId)) {
      res.status(403).json({ error: 'Access denied to this account' });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one item is required' });
      return;
    }

    const result = await transaction(async (client) => {
      // Create sequence (use unified account_id)
      const sequence = await client.queryOne<TemplateSequence>(
        `INSERT INTO template_sequences (account_id, user_id, name, description, shortcut)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [accountId, req.user!.userId, name, description || null, shortcut || null]
      );

      if (!sequence) {
        throw new Error('Failed to create sequence');
      }

      // Create items
      const createdItems: TemplateSequenceItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const createdItem = await client.queryOne<TemplateSequenceItem>(
          `INSERT INTO template_sequence_items
           (sequence_id, order_index, content_type, content, media_url, media_mime_type, delay_min_seconds, delay_max_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            sequence.id,
            i,
            item.content_type || 'text',
            item.content || null,
            item.media_url || null,
            item.media_mime_type || null,
            item.delay_min_seconds || 0,
            item.delay_max_seconds || 0
          ]
        );
        if (createdItem) {
          createdItems.push(createdItem);
        }
      }

      sequence.items = createdItems;
      return sequence;
    });

    res.status(201).json({ sequence: result });
  } catch (error) {
    console.error('Create sequence error:', error);
    res.status(500).json({ error: 'Failed to create sequence' });
  }
});

// Update template sequence (any agent with account access can update)
router.patch('/sequences/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, shortcut, is_active, items } = req.body;

    const existing = await queryOne<TemplateSequence>(
      'SELECT * FROM template_sequences WHERE id = $1',
      [req.params.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }

    // Check access
    const hasAccess = existing.user_id === req.user!.userId ||
      (existing.account_id && await userHasAccountAccess(req.user!.userId, existing.account_id));

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to this sequence' });
      return;
    }

    const result = await transaction(async (client) => {
      // Update sequence
      const sequence = await client.queryOne<TemplateSequence>(
        `UPDATE template_sequences
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             shortcut = COALESCE($3, shortcut),
             is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [name, description, shortcut, is_active, req.params.id]
      );

      if (!sequence) {
        throw new Error('Failed to update sequence');
      }

      // If items provided, replace all items
      if (items && Array.isArray(items)) {
        // Delete existing items
        await client.query(
          'DELETE FROM template_sequence_items WHERE sequence_id = $1',
          [req.params.id]
        );

        // Create new items
        const createdItems: TemplateSequenceItem[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const createdItem = await client.queryOne<TemplateSequenceItem>(
            `INSERT INTO template_sequence_items
             (sequence_id, order_index, content_type, content, media_url, media_mime_type, delay_min_seconds, delay_max_seconds)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
              sequence.id,
              i,
              item.content_type || 'text',
              item.content || null,
              item.media_url || null,
              item.media_mime_type || null,
              item.delay_min_seconds || 0,
              item.delay_max_seconds || 0
            ]
          );
          if (createdItem) {
            createdItems.push(createdItem);
          }
        }
        sequence.items = createdItems;
      } else {
        // Load existing items
        const existingItems = await query<TemplateSequenceItem>(
          'SELECT * FROM template_sequence_items WHERE sequence_id = $1 ORDER BY order_index ASC',
          [sequence.id]
        );
        sequence.items = existingItems;
      }

      return sequence;
    });

    res.json({ sequence: result });
  } catch (error) {
    console.error('Update sequence error:', error);
    res.status(500).json({ error: 'Failed to update sequence' });
  }
});

// Delete template sequence (any agent with account access can delete)
router.delete('/sequences/:id', async (req: Request, res: Response) => {
  try {
    const existing = await queryOne<TemplateSequence>(
      'SELECT * FROM template_sequences WHERE id = $1',
      [req.params.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }

    // Check access
    const hasAccess = existing.user_id === req.user!.userId ||
      (existing.account_id && await userHasAccountAccess(req.user!.userId, existing.account_id));

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to this sequence' });
      return;
    }

    const rowsDeleted = await execute(
      'DELETE FROM template_sequences WHERE id = $1',
      [req.params.id]
    );

    if (rowsDeleted === 0) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }

    res.json({ message: 'Sequence deleted' });
  } catch (error) {
    console.error('Delete sequence error:', error);
    res.status(500).json({ error: 'Failed to delete sequence' });
  }
});

// Execute a template sequence (send all items with delays)
router.post('/sequences/:id/execute', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }

    // Start execution in background (returns immediately)
    res.json({
      message: 'Sequence execution started',
      sequenceId: req.params.id,
      conversationId
    });

    // Execute sequence asynchronously
    executeSequence(req.params.id, conversationId, req.user!.userId)
      .then(result => {
        console.log(`[Templates] Sequence execution result:`, result);
      })
      .catch(error => {
        console.error(`[Templates] Sequence execution error:`, error);
      });

  } catch (error) {
    console.error('Execute sequence error:', error);
    res.status(500).json({ error: 'Failed to execute sequence' });
  }
});

export default router;
