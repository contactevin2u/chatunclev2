import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getConversationProfilePic } from '../services/profilePicService';
import { sessionManager } from '../services/whatsapp/SessionManager';

const router = Router();

router.use(authenticate);

// List conversations for user's accounts (includes both 1:1 and group conversations)
// Uses unified 'accounts' table for all channels (WhatsApp, Telegram, TikTok, etc.)
// Use ?unifyGroups=true to merge same groups across accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, unreadOnly, groupsOnly, unifyGroups, channelType } = req.query;

    // Unified query - no more UNION needed since all accounts are in one table
    // Uses LATERAL join for better performance
    let sql = `
      SELECT
        c.id,
        c.account_id,
        c.contact_id,
        c.group_id,
        c.is_group,
        c.last_message_at,
        c.unread_count,
        c.created_at,
        COALESCE(c.channel_type, 'whatsapp') as channel_type,
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
        a.id as wa_account_id,
        a.name as account_name,
        -- Last message data via LATERAL join
        lm.last_message_data
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'content', m.content,
          'sender_type', m.sender_type,
          'sender_name', m.sender_name,
          'created_at', m.created_at
        ) as last_message_data
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE (a.user_id = $1 OR aa.agent_id IS NOT NULL)
    `;

    const params: any[] = [req.user!.userId];

    if (accountId) {
      params.push(accountId);
      sql += ` AND c.account_id = $${params.length}`;
    }

    // Filter by channel type if specified
    if (channelType) {
      params.push(channelType);
      sql += ` AND COALESCE(c.channel_type, 'whatsapp') = $${params.length}`;
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
      whatsapp_account_id: conv.account_id, // Now unified for both WhatsApp and Telegram
      channel_type: conv.channel_type || 'whatsapp',
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
// Uses unified 'accounts' table for all channels
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Single unified query for all channel types
    const conversation = await queryOne(`
      SELECT
        c.*,
        COALESCE(c.channel_type, 'whatsapp') as resolved_channel_type,
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
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
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
// Respects incognito mode - won't clear unread count or send read receipts when enabled
// Uses unified 'accounts' table for all channels
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    // Single unified query for all channel types
    const conversation = await queryOne<{
      id: string;
      account_id: string;
      channel_type: string;
      incognito_mode: boolean;
      is_group: boolean;
      group_jid: string | null;
      wa_id: string | null;
      jid_type: string | null;
    }>(`
      SELECT c.id, c.account_id,
             COALESCE(c.channel_type, 'whatsapp') as channel_type,
             COALESCE(a.incognito_mode, FALSE) as incognito_mode,
             c.is_group,
             g.group_jid, ct.wa_id, ct.jid_type
      FROM conversations c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      LEFT JOIN groups g ON c.group_id = g.id
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      WHERE c.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // INCOGNITO MODE: Don't clear unread count or send read receipts (WhatsApp only)
    console.log(`[Conversations] Mark read - incognito_mode value:`, conversation.incognito_mode, typeof conversation.incognito_mode);
    if (conversation.incognito_mode) {
      console.log(`[Conversations] Incognito mode ENABLED - not marking ${req.params.id} as read`);
      res.json({ message: 'Incognito mode - not marked as read', incognito: true });
      return;
    }

    // Clear unread count in database (works for both channels)
    await execute(
      'UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Send read receipts (channel-specific)
    if (conversation.channel_type === 'whatsapp' && conversation.account_id) {
      // WhatsApp: Send read receipts via Baileys (blue ticks)
      const unreadMessages = await query<{ wa_message_id: string; sender_jid: string | null }>(`
        SELECT wa_message_id, sender_jid
        FROM messages
        WHERE conversation_id = $1
          AND sender_type = 'contact'
          AND wa_message_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 20
      `, [req.params.id]);

      if (unreadMessages.length > 0) {
        // Construct JID for read receipts
        const remoteJid = conversation.is_group && conversation.group_jid
          ? conversation.group_jid
          : conversation.wa_id
            ? `${conversation.wa_id}@${conversation.jid_type === 'lid' ? 'lid' : 's.whatsapp.net'}`
            : null;

        if (remoteJid) {
          const keys = unreadMessages.map(msg => ({
            remoteJid,
            id: msg.wa_message_id,
            fromMe: false,
            ...(conversation.is_group && msg.sender_jid ? { participant: msg.sender_jid } : {}),
          }));

          // Send read receipts in background (don't block response)
          sessionManager.markAsRead(conversation.account_id, keys)
            .catch(err => console.error('[Conversations] Failed to send read receipts:', err));
        }
      }
    }
    // Note: Telegram bots cannot send read receipts (API limitation)
    // The unread_count is still cleared in our database

    res.json({ message: 'Marked as read', channelType: conversation.channel_type });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Get conversation profile picture (fetches from WhatsApp if not cached)
// Works for both contact and group conversations
router.get('/:id/profile-pic', async (req: Request, res: Response) => {
  try {
    // Verify ownership or shared access using unified accounts table
    const conversation = await queryOne<{ id: string; account_id: string }>(`
      SELECT c.id, c.account_id
      FROM conversations c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.id, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get profile pic (will fetch from WhatsApp and cache if needed)
    const profilePicUrl = await getConversationProfilePic(conversation.account_id, conversation.id);

    res.json({ profile_pic_url: profilePicUrl });
  } catch (error) {
    console.error('Get conversation profile pic error:', error);
    res.status(500).json({ error: 'Failed to get profile picture' });
  }
});

export default router;
