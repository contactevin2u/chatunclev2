import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getIO } from '../services/socket';
import { Message } from '../types';

const router = Router();

router.use(authenticate);

// Get messages for a conversation (supports both 1:1 and group conversations)
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { limit = 50, before } = req.query;

    // Verify ownership (handles both 1:1 and group conversations)
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, c.is_group, c.group_id,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.conversationId, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Include sender_jid, sender_name, and reactions for messages
    let sql = `
      SELECT m.id, m.wa_message_id, m.sender_type, m.content_type, m.content,
             m.media_url, m.media_mime_type, m.status, m.created_at,
             m.agent_id, m.is_auto_reply, m.response_time_ms,
             m.sender_jid, m.sender_name, m.reactions,
             u.name as agent_name
      FROM messages m
      LEFT JOIN users u ON m.agent_id = u.id
      WHERE m.conversation_id = $1
    `;
    const params: any[] = [req.params.conversationId];

    if (before) {
      params.push(before);
      sql += ` AND m.created_at < $${params.length}`;
    }

    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

    const messages = await query<Message>(sql, params);

    res.json({
      messages: messages.reverse(),
      is_group: conversation.is_group || false,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message (optimistic UI - returns immediately, sends in background)
// Supports both 1:1 and group conversations
router.post('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { content, contentType = 'text', mediaUrl, mediaMimeType } = req.body;
    const agentId = req.user!.userId;

    // Verify ownership and get details - handle both 1:1 (contact_id) and group (group_id) conversations
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, c.is_group, c.first_response_at,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [req.params.conversationId, agentId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Validate we have a recipient
    const isGroup = conversation.is_group || false;
    if (!isGroup && !conversation.wa_id) {
      res.status(400).json({ error: 'No contact associated with this conversation' });
      return;
    }
    if (isGroup && !conversation.group_jid) {
      res.status(400).json({ error: 'No group JID associated with this conversation' });
      return;
    }

    // Calculate response time (time since last contact message)
    const lastContactMessage = await queryOne(`
      SELECT created_at FROM messages
      WHERE conversation_id = $1 AND sender_type = 'contact'
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.params.conversationId]);

    const responseTimeMs = lastContactMessage
      ? Date.now() - new Date(lastContactMessage.created_at).getTime()
      : null;

    // Get agent name
    const agent = await queryOne('SELECT name FROM users WHERE id = $1', [agentId]);

    // === OPTIMISTIC UI: Save message immediately with 'pending' status ===
    const message = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id, response_time_ms)
      VALUES ($1, 'agent', $2, $3, $4, $5, 'pending', $6, $7)
      RETURNING *
    `, [req.params.conversationId, contentType, content, mediaUrl, mediaMimeType, agentId, responseTimeMs]);

    // Update conversation immediately
    await execute(`
      UPDATE conversations
      SET last_message_at = NOW(),
          updated_at = NOW(),
          first_response_at = COALESCE(first_response_at, NOW()),
          assigned_agent_id = COALESCE(assigned_agent_id, $2)
      WHERE id = $1
    `, [req.params.conversationId, agentId]);

    // Return immediately to frontend (optimistic response)
    res.status(201).json({
      message: {
        ...message,
        agent_name: agent?.name,
      }
    });

    // === SEND IN BACKGROUND: Anti-ban delays happen here, not blocking UI ===
    (async () => {
      try {
        let waMessageId: string;

        if (isGroup) {
          // Send to group using group-specific anti-ban
          waMessageId = await sessionManager.sendGroupMessage(
            conversation.whatsapp_account_id,
            conversation.group_jid,
            {
              type: contentType,
              content,
              mediaUrl,
              mediaMimeType,
            }
          );
        } else {
          // Send to 1:1 contact using standard anti-ban
          waMessageId = await sessionManager.sendMessage(
            conversation.whatsapp_account_id,
            conversation.wa_id,
            {
              type: contentType,
              content,
              mediaUrl,
              mediaMimeType,
            },
            {
              jidType: conversation.jid_type || 'pn',  // Use stored JID type for correct format
            }
          );
        }

        // Update message with WhatsApp ID and 'sent' status
        await execute(`
          UPDATE messages SET wa_message_id = $1, status = 'sent', updated_at = NOW()
          WHERE id = $2
        `, [waMessageId, message!.id]);

        // Notify frontend of successful send via Socket.io
        const io = getIO();
        io.to(`user:${agentId}`).emit('message:status', {
          messageId: message!.id,
          waMessageId,
          status: 'sent',
        });

        // Log agent activity
        await execute(`
          INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
          VALUES ($1, 'message_sent', 'conversation', $2, $3)
        `, [agentId, req.params.conversationId, JSON.stringify({ content_type: contentType, response_time_ms: responseTimeMs, is_group: isGroup })]);

      } catch (error: any) {
        console.error('Background send error:', error);

        // Update message status to 'failed'
        await execute(`
          UPDATE messages SET status = 'failed', updated_at = NOW()
          WHERE id = $1
        `, [message!.id]);

        // Notify frontend of failure
        const io = getIO();
        io.to(`user:${agentId}`).emit('message:status', {
          messageId: message!.id,
          status: 'failed',
          error: error.message,
        });
      }
    })();

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// React to a message
router.post('/:messageId/react', async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;

    if (emoji === undefined) {
      res.status(400).json({ error: 'emoji is required (use empty string to remove reaction)' });
      return;
    }

    // Get message with conversation details
    const message = await queryOne<{
      id: string;
      wa_message_id: string;
      conversation_id: string;
      sender_type: string;
      reactions: any[];
    }>(`
      SELECT m.id, m.wa_message_id, m.conversation_id, m.sender_type, m.reactions,
             c.whatsapp_account_id, c.is_group, c.group_id,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.id = $1 AND wa.user_id = $2
    `, [req.params.messageId, req.user!.userId]);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Construct the remote JID
    const remoteJid = (message as any).is_group
      ? (message as any).group_jid
      : `${(message as any).wa_id}@${(message as any).jid_type === 'lid' ? 'lid' : 's.whatsapp.net'}`;

    // Construct message key for Baileys
    const messageKey = {
      remoteJid,
      id: message.wa_message_id,
      fromMe: message.sender_type === 'agent',
    };

    // Send the reaction via WhatsApp
    await sessionManager.sendReaction(
      (message as any).whatsapp_account_id,
      remoteJid,
      messageKey,
      emoji
    );

    // Update local reactions (the messages.reaction event will also update this)
    let reactions = message.reactions || [];
    const myId = 'me'; // Our reactions are tracked as 'me'

    if (emoji === '') {
      reactions = reactions.filter((r: any) => r.sender !== myId);
    } else {
      reactions = reactions.filter((r: any) => r.sender !== myId);
      reactions.push({ emoji, sender: myId, timestamp: Date.now() });
    }

    await execute(
      `UPDATE messages SET reactions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(reactions), message.id]
    );

    // Emit to frontend
    const io = getIO();
    io.to(`user:${req.user!.userId}`).emit('message:reaction', {
      messageId: message.id,
      waMessageId: message.wa_message_id,
      reactions,
    });

    res.json({ success: true, reactions });
  } catch (error: any) {
    console.error('React to message error:', error);
    res.status(500).json({ error: error.message || 'Failed to react to message' });
  }
});

export default router;
