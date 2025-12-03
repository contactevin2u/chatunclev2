import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// List contacts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, labelId, search } = req.query;

    let sql = `
      SELECT DISTINCT
        ct.id,
        ct.whatsapp_account_id,
        ct.wa_id,
        ct.name,
        ct.phone_number,
        ct.profile_pic_url,
        ct.created_at,
        wa.name as account_name
      FROM contacts ct
      JOIN whatsapp_accounts wa ON ct.whatsapp_account_id = wa.id
      LEFT JOIN contact_labels cl ON ct.id = cl.contact_id
      WHERE wa.user_id = $1
    `;

    const params: any[] = [req.user!.userId];

    if (accountId) {
      params.push(accountId);
      sql += ` AND ct.whatsapp_account_id = $${params.length}`;
    }

    if (labelId) {
      params.push(labelId);
      sql += ` AND cl.label_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (ct.name ILIKE $${params.length} OR ct.phone_number ILIKE $${params.length})`;
    }

    sql += ' ORDER BY ct.name ASC NULLS LAST';

    const contacts = await query(sql, params);

    // Get labels for each contact
    for (const contact of contacts) {
      const labels = await query(`
        SELECT l.id, l.name, l.color
        FROM labels l
        JOIN contact_labels cl ON l.id = cl.label_id
        WHERE cl.contact_id = $1
      `, [contact.id]);
      contact.labels = labels;
    }

    res.json({ contacts });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

// Update contact
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    // Verify ownership
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN whatsapp_accounts wa ON ct.whatsapp_account_id = wa.id
      WHERE ct.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const updated = await queryOne(`
      UPDATE contacts SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [name, req.params.id]);

    res.json({ contact: updated });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Add label to contact
router.post('/:id/labels', async (req: Request, res: Response) => {
  try {
    const { labelId } = req.body;

    // Verify contact ownership
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN whatsapp_accounts wa ON ct.whatsapp_account_id = wa.id
      WHERE ct.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Verify label ownership
    const label = await queryOne(
      'SELECT id FROM labels WHERE id = $1 AND user_id = $2',
      [labelId, req.user!.userId]
    );

    if (!label) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    await execute(`
      INSERT INTO contact_labels (contact_id, label_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [req.params.id, labelId]);

    res.json({ message: 'Label added' });
  } catch (error) {
    console.error('Add label error:', error);
    res.status(500).json({ error: 'Failed to add label' });
  }
});

// Remove label from contact
router.delete('/:id/labels/:labelId', async (req: Request, res: Response) => {
  try {
    // Verify contact ownership
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN whatsapp_accounts wa ON ct.whatsapp_account_id = wa.id
      WHERE ct.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    await execute(
      'DELETE FROM contact_labels WHERE contact_id = $1 AND label_id = $2',
      [req.params.id, req.params.labelId]
    );

    res.json({ message: 'Label removed' });
  } catch (error) {
    console.error('Remove label error:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

export default router;
