import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getConversationProfilePic } from '../services/profilePicService';

const router = Router();

router.use(authenticate);

// List conversations for user's accounts (includes both 1:1 and group conversations)
// Use ?unifyGroups=true to merge same groups across accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, unreadOnly, groupsOnly, unifyGroups } = req.query;

    // Build query that handles both 1:1 and group conversations
    let sql = `
      SELECT
        c.id,
        c.whatsapp_account_id,
        c.contact_id,
        c.group_id,
        c.is_group,
        c.last_message_at,
        c.unread_count,
        c.created_at,
        -- 1:1 contact info (NULL for groups)
        ct.wa_id,
        ct.name as contact_name,
        ct.phone_number as contact_phone,
        ct.profile_pic_url,
        -- Group info (NULL for 1:1)
        g.group_jid,
        g.name as group_name,
        g.participant_count,
        g.profile_pic_url as group_pic_url,
        -- Account info
        wa.id as wa_account_id,
        wa.name as account_name,
        -- Last message with sender info for groups
        (
          SELECT json_build_object(
            'content', m.content,
            'sender_type', m.sender_type,
            'sender_name', m.sender_name,
            'created_at', m.created_at
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_data
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $1
      WHERE (wa.user_id = $1 OR aa.agent_id IS NOT NULL)
    `;

    const params: any[] = [req.user!.userId];

    if (accountId) {
      params.push(accountId);
      sql += ` AND c.whatsapp_account_id = $${params.length}`;
    }

    if (unreadOnly === 'true') {
      sql += ' AND c.unread_count > 0';
    }

    if (groupsOnly === 'true') {
      sql += ' AND c.is_group = TRUE';
    } else if (groupsOnly === 'false') {
      sql += ' AND (c.is_group = FALSE OR c.is_group IS NULL)';
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    const conversations = await query(sql, params);

    // Process conversations and add labels for 1:1 conversations
    const contactIds = conversations
      .filter((c: any) => c.contact_id)
      .map((c: any) => c.contact_id);

    let labelsByContact = new Map<string, any[]>();
    if (contactIds.length > 0) {
      const allLabels = await query(`
        SELECT cl.contact_id, l.id, l.name, l.color
        FROM labels l
        JOIN contact_labels cl ON l.id = cl.label_id
        WHERE cl.contact_id = ANY($1)
      `, [contactIds]);

      for (const label of allLabels) {
        const existing = labelsByContact.get(label.contact_id) || [];
        existing.push({ id: label.id, name: label.name, color: label.color });
        labelsByContact.set(label.contact_id, existing);
      }
    }

    // Transform conversations
    const transformed = conversations.map((conv: any) => ({
      id: conv.id,
      whatsapp_account_id: conv.whatsapp_account_id,
      is_group: conv.is_group || false,
      last_message_at: conv.last_message_at,
      unread_count: conv.unread_count,
      created_at: conv.created_at,
      account_name: conv.account_name,
      account_id: conv.wa_account_id,
      last_message: conv.last_message_data?.content || null,
      last_message_sender: conv.last_message_data?.sender_name || null,
      // 1:1 contact fields
      contact_id: conv.contact_id,
      wa_id: conv.wa_id,
      contact_name: conv.contact_name,
      contact_phone: conv.contact_phone,
      profile_pic_url: conv.profile_pic_url,
      labels: labelsByContact.get(conv.contact_id) || [],
      // Group fields
      group_id: conv.group_id,
      group_jid: conv.group_jid,
      group_name: conv.group_name,
      participant_count: conv.participant_count,
      group_pic_url: conv.group_pic_url,
      // Display name (works for both)
      display_name: conv.is_group ? conv.group_name : (conv.contact_name || conv.contact_phone || conv.wa_id),
    }));

    // If unifyGroups is enabled, merge group conversations by group_jid
    if (unifyGroups === 'true') {
      const groupsByJid = new Map<string, any[]>();
      const nonGroups: any[] = [];

      for (const conv of transformed) {
        if (conv.is_group && conv.group_jid) {
          const existing = groupsByJid.get(conv.group_jid) || [];
          existing.push(conv);
          groupsByJid.set(conv.group_jid, existing);
        } else {
          nonGroups.push(conv);
        }
      }

      // Create unified group entries
      const unifiedGroups: any[] = [];
      for (const [groupJid, groupConvs] of groupsByJid.entries()) {
        // Sort by last_message_at to get most recent
        groupConvs.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        });

        const mostRecent = groupConvs[0];
        const totalUnread = groupConvs.reduce((sum, c) => sum + (c.unread_count || 0), 0);

        // Build accounts array with their conversation details
        const accounts = groupConvs.map(c => ({
          conversation_id: c.id,
          account_id: c.account_id,
          account_name: c.account_name,
          unread_count: c.unread_count,
          last_message_at: c.last_message_at,
        }));

        unifiedGroups.push({
          // Use the group_jid as the unified ID
          id: `unified_${groupJid}`,
          is_unified_group: true,
          is_group: true,
          group_jid: groupJid,
          group_name: mostRecent.group_name,
          group_pic_url: mostRecent.group_pic_url,
          participant_count: mostRecent.participant_count,
          display_name: mostRecent.group_name,
          // Aggregated data
          total_unread: totalUnread,
          account_count: accounts.length,
          accounts: accounts,
          // Most recent message info
          last_message_at: mostRecent.last_message_at,
          last_message: mostRecent.last_message,
          last_message_sender: mostRecent.last_message_sender,
          last_message_account: mostRecent.account_name,
          // For compatibility - use first account's conversation as default
          default_conversation_id: mostRecent.id,
          whatsapp_account_id: mostRecent.whatsapp_account_id,
        });
      }

      // Combine and sort by last_message_at
      const result = [...nonGroups, ...unifiedGroups].sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTime - aTime;
      });

      res.json({ conversations: result, unified: true });
    } else {
      res.json({ conversations: transformed });
    }
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Get single conversation with recent messages (supports both 1:1 and groups)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Get conversation with ownership or shared access check (handles both 1:1 and groups)
    const conversation = await queryOne(`
      SELECT
        c.*,
        -- 1:1 contact info
        ct.wa_id,
        ct.name as contact_name,
        ct.phone_number as contact_phone,
        ct.profile_pic_url,
        ct.jid_type,
        -- Group info
        g.group_jid,
        g.name as group_name,
        g.description as group_description,
        g.participant_count,
        g.profile_pic_url as group_pic_url,
        g.is_announce,
        g.is_restrict
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get labels for 1:1 conversations
    let labels: any[] = [];
    if (conversation.contact_id) {
      labels = await query(`
        SELECT l.id, l.name, l.color
        FROM labels l
        JOIN contact_labels cl ON l.id = cl.label_id
        WHERE cl.contact_id = $1
      `, [conversation.contact_id]);
    }

    // Get participants for group conversations
    let participants: any[] = [];
    if (conversation.group_id) {
      participants = await query(`
        SELECT participant_jid, is_admin, is_superadmin
        FROM group_participants
        WHERE group_id = $1
        ORDER BY is_superadmin DESC, is_admin DESC, participant_jid
      `, [conversation.group_id]);
    }

    res.json({
      conversation: {
        ...conversation,
        labels,
        participants,
        display_name: conversation.is_group
          ? conversation.group_name
          : (conversation.contact_name || conversation.contact_phone || conversation.wa_id),
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
    // Verify ownership or shared access
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
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

// Get conversation profile picture (fetches from WhatsApp if not cached)
// Works for both contact and group conversations
router.get('/:id/profile-pic', async (req: Request, res: Response) => {
  try {
    // Verify ownership or shared access
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get profile pic (will fetch from WhatsApp and cache if needed)
    const profilePicUrl = await getConversationProfilePic(conversation.whatsapp_account_id, conversation.id);

    res.json({ profile_pic_url: profilePicUrl });
  } catch (error) {
    console.error('Get conversation profile pic error:', error);
    res.status(500).json({ error: 'Failed to get profile picture' });
  }
});

export default router;
