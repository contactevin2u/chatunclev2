import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AutoReplyRule } from '../types';

const router = Router();

router.use(authenticate);

// Get all auto-reply rules for user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { accountId } = req.query;

    let filter = 'ar.user_id = $1';
    const params: any[] = [userId];

    if (accountId) {
      params.push(accountId);
      filter += ` AND (ar.whatsapp_account_id = $2 OR ar.whatsapp_account_id IS NULL)`;
    }

    const rules = await query<AutoReplyRule>(`
      SELECT ar.*, t.name as template_name, a.name as account_name
      FROM auto_reply_rules ar
      LEFT JOIN templates t ON ar.response_template_id = t.id
      LEFT JOIN accounts a ON ar.whatsapp_account_id = a.id
      WHERE ${filter}
      ORDER BY ar.priority DESC, ar.created_at DESC
    `, params);

    res.json({ rules });
  } catch (error) {
    console.error('Get auto-reply rules error:', error);
    res.status(500).json({ error: 'Failed to get auto-reply rules' });
  }
});

// Get single rule
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const rule = await queryOne<AutoReplyRule>(`
      SELECT * FROM auto_reply_rules WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json({ rule });
  } catch (error) {
    console.error('Get auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to get auto-reply rule' });
  }
});

// Create auto-reply rule
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      name,
      whatsappAccountId,
      triggerType = 'keyword',
      triggerKeywords,
      triggerRegex,
      responseType = 'text',
      responseContent,
      responseTemplateId,
      useAi = false,
      aiPrompt,
      priority = 0,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (triggerType === 'keyword' && (!triggerKeywords || triggerKeywords.length === 0)) {
      res.status(400).json({ error: 'Keywords are required for keyword trigger type' });
      return;
    }

    if (triggerType === 'regex' && !triggerRegex) {
      res.status(400).json({ error: 'Regex pattern is required for regex trigger type' });
      return;
    }

    if (responseType === 'text' && !responseContent && !useAi) {
      res.status(400).json({ error: 'Response content is required for text response type' });
      return;
    }

    if (responseType === 'template' && !responseTemplateId) {
      res.status(400).json({ error: 'Template ID is required for template response type' });
      return;
    }

    if (useAi && !aiPrompt) {
      res.status(400).json({ error: 'AI prompt is required when using AI' });
      return;
    }

    // Verify account ownership if specified
    if (whatsappAccountId) {
      const account = await queryOne(`
        SELECT id FROM accounts WHERE id = $1 AND user_id = $2
      `, [whatsappAccountId, userId]);

      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
    }

    const rule = await queryOne<AutoReplyRule>(`
      INSERT INTO auto_reply_rules (
        user_id, whatsapp_account_id, name, trigger_type, trigger_keywords, trigger_regex,
        response_type, response_content, response_template_id, use_ai, ai_prompt, priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      userId,
      whatsappAccountId || null,
      name,
      triggerType,
      triggerKeywords || null,
      triggerRegex || null,
      responseType,
      responseContent || null,
      responseTemplateId || null,
      useAi,
      aiPrompt || null,
      priority,
    ]);

    res.status(201).json({ rule });
  } catch (error) {
    console.error('Create auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to create auto-reply rule' });
  }
});

// Update auto-reply rule
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Verify ownership
    const existing = await queryOne(`
      SELECT id FROM auto_reply_rules WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    const allowedFields = [
      'name', 'trigger_type', 'trigger_keywords', 'trigger_regex',
      'response_type', 'response_content', 'response_template_id',
      'use_ai', 'ai_prompt', 'is_active', 'priority'
    ];

    const fieldMapping: Record<string, string> = {
      triggerType: 'trigger_type',
      triggerKeywords: 'trigger_keywords',
      triggerRegex: 'trigger_regex',
      responseType: 'response_type',
      responseContent: 'response_content',
      responseTemplateId: 'response_template_id',
      useAi: 'use_ai',
      aiPrompt: 'ai_prompt',
      isActive: 'is_active',
    };

    for (const [key, value] of Object.entries(req.body)) {
      const dbField = fieldMapping[key] || key;
      if (allowedFields.includes(dbField) && value !== undefined) {
        params.push(value);
        updates.push(`${dbField} = $${paramIndex++}`);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    updates.push('updated_at = NOW()');

    const rule = await queryOne<AutoReplyRule>(`
      UPDATE auto_reply_rules
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    res.json({ rule });
  } catch (error) {
    console.error('Update auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to update auto-reply rule' });
  }
});

// Toggle auto-reply rule active status
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const rule = await queryOne<AutoReplyRule>(`
      UPDATE auto_reply_rules
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json({ rule });
  } catch (error) {
    console.error('Toggle auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to toggle auto-reply rule' });
  }
});

// Delete auto-reply rule
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const rowCount = await execute(`
      DELETE FROM auto_reply_rules WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    if (rowCount === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to delete auto-reply rule' });
  }
});

// Test auto-reply rule
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user!.userId;

    if (!message) {
      res.status(400).json({ error: 'Test message is required' });
      return;
    }

    const rule = await queryOne<AutoReplyRule>(`
      SELECT * FROM auto_reply_rules WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    let matches = false;

    if (rule.trigger_type === 'keyword' && rule.trigger_keywords) {
      const messageLower = message.toLowerCase();
      matches = rule.trigger_keywords.some((keyword: string) =>
        messageLower.includes(keyword.toLowerCase())
      );
    } else if (rule.trigger_type === 'regex' && rule.trigger_regex) {
      const regex = new RegExp(rule.trigger_regex, 'i');
      matches = regex.test(message);
    } else if (rule.trigger_type === 'all') {
      matches = true;
    }

    res.json({
      matches,
      rule_name: rule.name,
      would_respond: matches && rule.is_active,
      response_preview: matches ? rule.response_content : null,
    });
  } catch (error) {
    console.error('Test auto-reply rule error:', error);
    res.status(500).json({ error: 'Failed to test auto-reply rule' });
  }
});

export default router;
