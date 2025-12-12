import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getContactProfilePic } from '../services/profilePicService';

const router = Router();

router.use(authenticate);

// List contacts - uses unified 'accounts' table for all channels
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, labelId, search, channelType } = req.query;
    const userId = req.user!.userId;

    // Unified query - no more UNION needed
    let sql = `
      SELECT DISTINCT
        ct.id,
        ct.account_id,
        ct.wa_id,
        ct.name,
        ct.phone_number,
        ct.profile_pic_url,
        ct.created_at,
        a.name as account_name,
        COALESCE(ct.channel_type, 'whatsapp') as channel_type
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
      LEFT JOIN contact_labels cl ON ct.id = cl.contact_id
      WHERE (a.user_id = $1 OR aa.agent_id IS NOT NULL)
    `;

    const params: any[] = [userId];

    // Filter by channel type
    if (channelType) {
      params.push(channelType);
      sql += ` AND COALESCE(ct.channel_type, 'whatsapp') = $${params.length}`;
    }

    // Filter by account ID
    if (accountId) {
      params.push(accountId);
      sql += ` AND ct.account_id = $${params.length}`;
    }

    if (labelId) {
      params.push(labelId);
      sql += ` AND cl.label_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (ct.name ILIKE $${params.length} OR ct.phone_number ILIKE $${params.length})`;
    }

    sql += ' GROUP BY ct.id, ct.account_id, ct.wa_id, ct.name, ct.phone_number, ct.profile_pic_url, ct.created_at, a.name, ct.channel_type';
    sql += ' ORDER BY ct.name ASC NULLS LAST';

    const contacts = await query(sql, params);

    // Batch fetch labels for all contacts (fixes N+1 query)
    if (contacts.length > 0) {
      const contactIds = contacts.map((c: any) => c.id);
      const allLabels = await query(`
        SELECT cl.contact_id, l.id, l.name, l.color
        FROM labels l
        JOIN contact_labels cl ON l.id = cl.label_id
        WHERE cl.contact_id = ANY($1)
      `, [contactIds]);

      // Group labels by contact_id
      const labelsByContact = new Map<string, any[]>();
      for (const label of allLabels) {
        const existing = labelsByContact.get(label.contact_id) || [];
        existing.push({ id: label.id, name: label.name, color: label.color });
        labelsByContact.set(label.contact_id, existing);
      }

      // Attach labels to contacts
      for (const contact of contacts) {
        (contact as any).labels = labelsByContact.get(contact.id) || [];
      }
    }

    res.json({ contacts });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

// Get single contact - uses unified 'accounts' table
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const contactId = req.params.id;

    // Single unified query
    const contact = await queryOne(`
      SELECT
        ct.id,
        ct.account_id,
        ct.wa_id,
        ct.name,
        ct.phone_number,
        ct.profile_pic_url,
        ct.jid_type,
        ct.created_at,
        ct.updated_at,
        a.name as account_name,
        COALESCE(ct.channel_type, 'whatsapp') as channel_type
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE ct.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [contactId, userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Get labels for this contact
    const labels = await query(`
      SELECT l.id, l.name, l.color
      FROM labels l
      JOIN contact_labels cl ON l.id = cl.label_id
      WHERE cl.contact_id = $1
    `, [contactId]);

    (contact as any).labels = labels;

    res.json({ contact });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// Get contact profile picture (fetches from WhatsApp if not cached)
router.get('/:id/profile-pic', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const contactId = req.params.id;

    // Unified query
    const contact = await queryOne<{
      id: string;
      account_id: string;
      profile_pic_url: string | null;
      channel_type: string;
    }>(`
      SELECT ct.id, ct.account_id, ct.profile_pic_url, COALESCE(ct.channel_type, 'whatsapp') as channel_type
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE ct.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [contactId, userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // For non-WhatsApp contacts, just return cached URL (no live fetching)
    if (contact.channel_type !== 'whatsapp') {
      res.json({ profile_pic_url: contact.profile_pic_url || null });
      return;
    }

    // For WhatsApp contacts, fetch from WhatsApp and cache if needed
    const profilePicUrl = await getContactProfilePic(contact.account_id, contact.id);

    res.json({ profile_pic_url: profilePicUrl });
  } catch (error) {
    console.error('Get contact profile pic error:', error);
    res.status(500).json({ error: 'Failed to get profile picture' });
  }
});

// Update contact - uses unified 'accounts' table
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const userId = req.user!.userId;
    const contactId = req.params.id;

    // Verify ownership or shared access
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE ct.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [contactId, userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const updated = await queryOne(`
      UPDATE contacts SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [name, contactId]);

    res.json({ contact: updated });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Add label to contact - uses unified 'accounts' table
router.post('/:id/labels', async (req: Request, res: Response) => {
  try {
    const { labelId } = req.body;
    const userId = req.user!.userId;
    const contactId = req.params.id;

    // Verify contact ownership or shared access
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE ct.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [contactId, userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Verify label ownership
    const label = await queryOne(
      'SELECT id FROM labels WHERE id = $1 AND user_id = $2',
      [labelId, userId]
    );

    if (!label) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    await execute(`
      INSERT INTO contact_labels (contact_id, label_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [contactId, labelId]);

    res.json({ message: 'Label added' });
  } catch (error) {
    console.error('Add label error:', error);
    res.status(500).json({ error: 'Failed to add label' });
  }
});

// Remove label from contact - uses unified 'accounts' table
router.delete('/:id/labels/:labelId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const contactId = req.params.id;

    // Verify contact ownership or shared access
    const contact = await queryOne(`
      SELECT ct.id
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE ct.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [contactId, userId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    await execute(
      'DELETE FROM contact_labels WHERE contact_id = $1 AND label_id = $2',
      [contactId, req.params.labelId]
    );

    res.json({ message: 'Label removed' });
  } catch (error) {
    console.error('Remove label error:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// Export contacts to CSV - uses unified 'accounts' table
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { accountId, labelId, channelType } = req.query;
    const userId = req.user!.userId;

    // Unified query - no more UNION
    let sql = `
      SELECT
        ct.id,
        ct.name,
        ct.phone_number,
        ct.wa_id,
        a.name as account_name,
        ct.account_id,
        COALESCE(ct.channel_type, 'whatsapp') as channel_type,
        ct.created_at,
        (
          SELECT string_agg(l.name, ', ')
          FROM contact_labels cl
          JOIN labels l ON cl.label_id = l.id
          WHERE cl.contact_id = ct.id
        ) as labels
      FROM contacts ct
      JOIN accounts a ON ct.account_id = a.id
      WHERE a.user_id = $1
    `;

    const params: any[] = [userId];

    if (channelType) {
      params.push(channelType);
      sql += ` AND COALESCE(ct.channel_type, 'whatsapp') = $${params.length}`;
    }

    if (accountId) {
      params.push(accountId);
      sql += ` AND ct.account_id = $${params.length}`;
    }

    if (labelId) {
      params.push(labelId);
      sql += ` AND EXISTS (SELECT 1 FROM contact_labels cl WHERE cl.contact_id = ct.id AND cl.label_id = $${params.length})`;
    }

    sql += ' ORDER BY ct.name ASC NULLS LAST';

    const contacts = await query(sql, params);

    // Generate CSV
    const headers = ['Name', 'Phone Number', 'Contact ID', 'Account', 'Channel', 'Labels', 'Created At'];
    const csvRows = [headers.join(',')];

    for (const contact of contacts) {
      const row = [
        `"${(contact.name || '').replace(/"/g, '""')}"`,
        `"${contact.phone_number || ''}"`,
        `"${contact.wa_id || ''}"`,
        `"${(contact.account_name || '').replace(/"/g, '""')}"`,
        `"${contact.channel_type || 'whatsapp'}"`,
        `"${(contact.labels || '').replace(/"/g, '""')}"`,
        `"${contact.created_at ? new Date(contact.created_at).toISOString() : ''}"`,
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export contacts error:', error);
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

// Import contacts from CSV - uses unified 'accounts' table
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { accountId, contacts: contactsData, channelType = 'whatsapp' } = req.body;
    const userId = req.user!.userId;

    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required' });
      return;
    }

    if (!contactsData || !Array.isArray(contactsData) || contactsData.length === 0) {
      res.status(400).json({ error: 'Contacts data is required' });
      return;
    }

    // Verify account ownership using unified accounts table
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const results = {
      imported: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const contact of contactsData) {
      try {
        const { name, phoneNumber, waId, labels } = contact;

        if (!phoneNumber && !waId) {
          results.failed++;
          results.errors.push(`Missing phone number or contact ID for contact: ${name || 'Unknown'}`);
          continue;
        }

        const contactId_wa = waId || phoneNumber?.replace(/[^0-9]/g, '');

        // Upsert contact using unified schema
        const existingContact = await queryOne(`
          SELECT id FROM contacts WHERE account_id = $1 AND wa_id = $2
        `, [accountId, contactId_wa]);

        let contactId: string;

        if (existingContact) {
          await execute(`
            UPDATE contacts SET name = COALESCE($1, name), phone_number = COALESCE($2, phone_number), updated_at = NOW()
            WHERE id = $3
          `, [name, phoneNumber, existingContact.id]);
          contactId = existingContact.id;
          results.updated++;
        } else {
          const newContact = await queryOne(`
            INSERT INTO contacts (account_id, wa_id, name, phone_number, channel_type)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [accountId, contactId_wa, name, phoneNumber, channelType]);
          contactId = newContact.id;
          results.imported++;
        }

        // Handle labels if provided
        if (labels && Array.isArray(labels)) {
          for (const labelName of labels) {
            // Get or create label
            let label = await queryOne(`
              SELECT id FROM labels WHERE user_id = $1 AND LOWER(name) = LOWER($2)
            `, [userId, labelName.trim()]);

            if (!label) {
              label = await queryOne(`
                INSERT INTO labels (user_id, name) VALUES ($1, $2) RETURNING id
              `, [userId, labelName.trim()]);
            }

            // Add label to contact
            await execute(`
              INSERT INTO contact_labels (contact_id, label_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `, [contactId, label.id]);
          }
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Failed to import contact: ${error.message}`);
      }
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// Bulk add labels to contacts - uses unified 'accounts' table
router.post('/bulk-label', async (req: Request, res: Response) => {
  try {
    const { contactIds, labelId } = req.body;
    const userId = req.user!.userId;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'Contact IDs are required' });
      return;
    }

    if (!labelId) {
      res.status(400).json({ error: 'Label ID is required' });
      return;
    }

    // Verify label ownership
    const label = await queryOne(`
      SELECT id FROM labels WHERE id = $1 AND user_id = $2
    `, [labelId, userId]);

    if (!label) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    // Verify contact ownership and add labels using unified accounts
    let added = 0;
    for (const contactId of contactIds) {
      const contact = await queryOne(`
        SELECT ct.id
        FROM contacts ct
        JOIN accounts a ON ct.account_id = a.id
        WHERE ct.id = $1 AND a.user_id = $2
      `, [contactId, userId]);

      if (contact) {
        await execute(`
          INSERT INTO contact_labels (contact_id, label_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [contactId, labelId]);
        added++;
      }
    }

    res.json({ success: true, added });
  } catch (error) {
    console.error('Bulk label error:', error);
    res.status(500).json({ error: 'Failed to add labels' });
  }
});

// Bulk remove labels from contacts - uses unified 'accounts' table
router.post('/bulk-unlabel', async (req: Request, res: Response) => {
  try {
    const { contactIds, labelId } = req.body;
    const userId = req.user!.userId;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'Contact IDs are required' });
      return;
    }

    if (!labelId) {
      res.status(400).json({ error: 'Label ID is required' });
      return;
    }

    // Verify label ownership
    const label = await queryOne(`
      SELECT id FROM labels WHERE id = $1 AND user_id = $2
    `, [labelId, userId]);

    if (!label) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    // Remove labels from owned contacts using unified accounts
    await execute(`
      DELETE FROM contact_labels
      WHERE label_id = $1
        AND contact_id = ANY($2::uuid[])
        AND contact_id IN (
          SELECT ct.id FROM contacts ct
          JOIN accounts a ON ct.account_id = a.id
          WHERE a.user_id = $3
        )
    `, [labelId, contactIds, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Bulk unlabel error:', error);
    res.status(500).json({ error: 'Failed to remove labels' });
  }
});

export default router;
