import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getGroupProfilePic } from '../services/profilePicService';

const router = Router();

router.use(authenticate);

// List all groups for user's accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    let sql = `
      SELECT
        g.id,
        g.whatsapp_account_id,
        g.group_jid,
        g.name,
        g.description,
        g.participant_count,
        g.profile_pic_url,
        g.is_announce,
        g.is_restrict,
        g.created_at,
        g.updated_at,
        wa.name as account_name,
        c.id as conversation_id,
        c.unread_count,
        c.last_message_at
      FROM groups g
      JOIN whatsapp_accounts wa ON g.whatsapp_account_id = wa.id
      LEFT JOIN conversations c ON c.group_id = g.id
      WHERE wa.user_id = $1
    `;

    const params: any[] = [req.user!.userId];

    if (accountId) {
      params.push(accountId);
      sql += ` AND g.whatsapp_account_id = $${params.length}`;
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST, g.name ASC';

    const groups = await query(sql, params);

    res.json({ groups });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// Get single group with participants
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const group = await queryOne(`
      SELECT
        g.*,
        wa.name as account_name,
        c.id as conversation_id,
        c.unread_count,
        c.last_message_at
      FROM groups g
      JOIN whatsapp_accounts wa ON g.whatsapp_account_id = wa.id
      LEFT JOIN conversations c ON c.group_id = g.id
      WHERE g.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Get participants
    const participants = await query(`
      SELECT participant_jid, is_admin, is_superadmin, created_at
      FROM group_participants
      WHERE group_id = $1
      ORDER BY is_superadmin DESC, is_admin DESC, participant_jid
    `, [req.params.id]);

    res.json({
      group: {
        ...group,
        participants,
      }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
});

// Get group by JID
router.get('/jid/:jid', async (req: Request, res: Response) => {
  try {
    const group = await queryOne(`
      SELECT
        g.*,
        wa.name as account_name,
        c.id as conversation_id
      FROM groups g
      JOIN whatsapp_accounts wa ON g.whatsapp_account_id = wa.id
      LEFT JOIN conversations c ON c.group_id = g.id
      WHERE g.group_jid = $1 AND wa.user_id = $2
    `, [req.params.jid, req.user!.userId]);

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    res.json({ group });
  } catch (error) {
    console.error('Get group by JID error:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
});

// Get group profile picture (fetches from WhatsApp if not cached)
router.get('/:id/profile-pic', async (req: Request, res: Response) => {
  try {
    // Verify group ownership
    const group = await queryOne(`
      SELECT g.id, g.whatsapp_account_id, g.profile_pic_url
      FROM groups g
      JOIN whatsapp_accounts wa ON g.whatsapp_account_id = wa.id
      WHERE g.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Get profile pic (will fetch from WhatsApp and cache if needed)
    const profilePicUrl = await getGroupProfilePic(group.whatsapp_account_id, group.id);

    res.json({ profile_pic_url: profilePicUrl });
  } catch (error) {
    console.error('Get group profile pic error:', error);
    res.status(500).json({ error: 'Failed to get profile picture' });
  }
});

// Get participants for a group
router.get('/:id/participants', async (req: Request, res: Response) => {
  try {
    // Verify ownership
    const group = await queryOne(`
      SELECT g.id
      FROM groups g
      JOIN whatsapp_accounts wa ON g.whatsapp_account_id = wa.id
      WHERE g.id = $1 AND wa.user_id = $2
    `, [req.params.id, req.user!.userId]);

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    const participants = await query(`
      SELECT participant_jid, is_admin, is_superadmin, created_at
      FROM group_participants
      WHERE group_id = $1
      ORDER BY is_superadmin DESC, is_admin DESC, participant_jid
    `, [req.params.id]);

    res.json({ participants });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

export default router;
