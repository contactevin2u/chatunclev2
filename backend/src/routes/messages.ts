import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getIO } from '../services/socket';
import { Message } from '../types';
import { gamificationService } from '../services/gamificationService';
import { substituteTemplateVariables } from '../utils/templateVariables';

const router = Router();

router.use(authenticate);

// Get messages for a conversation (supports both 1:1 and group conversations)
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { limit = 50, before } = req.query;

    // Verify ownership or shared access (handles both 1:1 and group conversations)
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, c.is_group, c.group_id,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.conversationId, req.user!.userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Include sender_jid, sender_name, reactions, and quoted message info
    let sql = `
      SELECT m.id, m.wa_message_id, m.sender_type, m.content_type, m.content,
             m.media_url, m.media_mime_type, m.status, m.created_at,
             m.agent_id, m.is_auto_reply, m.response_time_ms,
             m.sender_jid, m.sender_name, m.reactions,
             m.is_edited, m.edited_at,
             m.quoted_message_id, m.quoted_wa_message_id, m.quoted_content, m.quoted_sender_name,
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
// Supports reply (quote) by passing quotedMessageId
router.post('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { content, contentType = 'text', mediaUrl, mediaMimeType, latitude, longitude, locationName, quotedMessageId } = req.body;
    const agentId = req.user!.userId;

    // Verify ownership or shared access with send permission
    const conversation = await queryOne(`
      SELECT c.id, c.whatsapp_account_id, c.is_group, c.first_response_at,
             ct.wa_id, ct.jid_type,
             g.group_jid,
             CASE WHEN wa.user_id = $2 THEN 'owner' ELSE aa.permission END as permission
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.conversationId, agentId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Check permission - only owner, full, or send can send messages
    if (!['owner', 'full', 'send'].includes(conversation.permission)) {
      res.status(403).json({ error: 'You do not have permission to send messages' });
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

    // Get contact info for template variables (for 1:1 chats)
    let contactName = '';
    let contactPhone = '';
    if (!isGroup) {
      const contactInfo = await queryOne(`
        SELECT name, phone_number FROM contacts WHERE wa_id = $1
      `, [conversation.wa_id]);
      contactName = contactInfo?.name || '';
      contactPhone = contactInfo?.phone_number || conversation.wa_id?.replace('@s.whatsapp.net', '') || '';
    }

    // Substitute template variables in content
    const processedContent = content ? substituteTemplateVariables(content, {
      contactName,
      contactPhone,
      agentName: agent?.name || ''
    }) : content;

    // Get quoted message info if replying
    let quotedInfo: { id: string; wa_message_id: string; content: string; sender_name: string | null } | null = null;
    if (quotedMessageId) {
      quotedInfo = await queryOne<{ id: string; wa_message_id: string; content: string; sender_name: string | null }>(
        `SELECT id, wa_message_id, content, sender_name FROM messages WHERE id = $1`,
        [quotedMessageId]
      );
    }

    // === OPTIMISTIC UI: Save message immediately with 'pending' status ===
    const message = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id, response_time_ms,
                            quoted_message_id, quoted_wa_message_id, quoted_content, quoted_sender_name)
      VALUES ($1, 'agent', $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [req.params.conversationId, contentType, processedContent, mediaUrl, mediaMimeType, agentId, responseTimeMs,
        quotedInfo?.id || null, quotedInfo?.wa_message_id || null, quotedInfo?.content || null, quotedInfo?.sender_name || null]);

    // Update conversation immediately
    await execute(`
      UPDATE conversations
      SET last_message_at = NOW(),
          updated_at = NOW(),
          first_response_at = COALESCE(first_response_at, NOW()),
          assigned_agent_id = COALESCE(assigned_agent_id, $2)
      WHERE id = $1
    `, [req.params.conversationId, agentId]);

    // Emit message:new to account room so ALL agents see the new message immediately
    // This is critical for multi-agent sync - other agents won't see the message otherwise
    const io = getIO();
    io.to(`account:${conversation.whatsapp_account_id}`).emit('message:new', {
      accountId: conversation.whatsapp_account_id,
      conversationId: req.params.conversationId,
      message: {
        ...message,
        agent_name: agent?.name,
      },
    });

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

        // Build quoted message key if replying
        let quotedMessageKey: any = undefined;
        if (quotedMessageId) {
          const quotedMsg = await queryOne<{
            wa_message_id: string;
            sender_type: string;
            sender_jid: string | null;
          }>('SELECT wa_message_id, sender_type, sender_jid FROM messages WHERE id = $1', [quotedMessageId]);

          if (quotedMsg && quotedMsg.wa_message_id) {
            // Construct the JID for the remote JID in the key
            const remoteJid = isGroup
              ? conversation.group_jid
              : `${conversation.wa_id}@${(conversation.jid_type || 'pn') === 'lid' ? 'lid' : 's.whatsapp.net'}`;

            quotedMessageKey = {
              remoteJid,
              id: quotedMsg.wa_message_id,
              fromMe: quotedMsg.sender_type === 'agent',
              // For group messages from others, include participant
              ...(isGroup && quotedMsg.sender_type === 'contact' && quotedMsg.sender_jid && {
                participant: quotedMsg.sender_jid,
              }),
            };
            console.log(`[Messages] Replying to message ${quotedMessageId}, key:`, quotedMessageKey);
          }
        }

        if (isGroup) {
          // Send to group using group-specific anti-ban
          waMessageId = await sessionManager.sendGroupMessage(
            conversation.whatsapp_account_id,
            conversation.group_jid,
            {
              type: contentType,
              content: processedContent,
              mediaUrl,
              mediaMimeType,
              latitude,
              longitude,
              locationName,
              quotedMessageKey,
            }
          );
        } else {
          // Send to 1:1 contact using standard anti-ban
          waMessageId = await sessionManager.sendMessage(
            conversation.whatsapp_account_id,
            conversation.wa_id,
            {
              type: contentType,
              content: processedContent,
              mediaUrl,
              mediaMimeType,
              latitude,
              longitude,
              locationName,
              quotedMessageKey,
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

        // Notify frontend of successful send via Socket.io (emit to account room for multi-agent sync)
        const io = getIO();
        io.to(`account:${conversation.whatsapp_account_id}`).emit('message:status', {
          accountId: conversation.whatsapp_account_id,
          messageId: message!.id,
          waMessageId,
          status: 'sent',
        });

        // Log agent activity
        await execute(`
          INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
          VALUES ($1, 'message_sent', 'conversation', $2, $3)
        `, [agentId, req.params.conversationId, JSON.stringify({ content_type: contentType, response_time_ms: responseTimeMs, is_group: isGroup })]);

        // Track gamification stats
        try {
          // recordMessageSent now returns any new achievements
          const newAchievements = await gamificationService.recordMessageSent(agentId, responseTimeMs || undefined);

          // If this is a first response (no prior agent response in conversation), record it
          if (!conversation.first_response_at && responseTimeMs) {
            await gamificationService.recordFirstResponse(agentId, responseTimeMs);
          }

          // Notify about new achievements (keep to user room - personal achievement)
          if (newAchievements.length > 0) {
            console.log(`[Gamification] New achievements for agent ${agentId}:`, newAchievements.map(a => a.name));
            const io = getIO();
            io.to(`user:${agentId}`).emit('gamification:achievement', {
              achievements: newAchievements
            });
            console.log(`[Gamification] Emitted gamification:achievement to user:${agentId}`);
          }
        } catch (gamificationError) {
          console.error('Gamification tracking error:', gamificationError);
          // Don't fail the message send if gamification fails
        }

      } catch (error: any) {
        console.error('Background send error:', error);

        // Update message status to 'failed'
        await execute(`
          UPDATE messages SET status = 'failed', updated_at = NOW()
          WHERE id = $1
        `, [message!.id]);

        // Notify frontend of failure (emit to account room for multi-agent sync)
        const io = getIO();
        io.to(`account:${conversation.whatsapp_account_id}`).emit('message:status', {
          accountId: conversation.whatsapp_account_id,
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

    // Emit to account room for multi-agent sync
    const io = getIO();
    io.to(`account:${(message as any).whatsapp_account_id}`).emit('message:reaction', {
      accountId: (message as any).whatsapp_account_id,
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

// Forward a message to another conversation
router.post('/:messageId/forward', async (req: Request, res: Response) => {
  try {
    const { targetConversationId } = req.body;
    const agentId = req.user!.userId;

    if (!targetConversationId) {
      res.status(400).json({ error: 'targetConversationId is required' });
      return;
    }

    // Get original message with its conversation details
    const originalMessage = await queryOne<{
      id: string;
      wa_message_id: string;
      conversation_id: string;
      content_type: string;
      content: string;
      media_url: string | null;
      media_mime_type: string | null;
      sender_type: string;
      sender_jid: string | null;
      whatsapp_account_id: string;
      is_group: boolean;
      group_jid: string | null;
      wa_id: string | null;
      jid_type: string | null;
      raw_message: any;
    }>(`
      SELECT m.id, m.wa_message_id, m.conversation_id, m.content_type, m.content,
             m.media_url, m.media_mime_type, m.sender_type, m.sender_jid, m.raw_message,
             c.whatsapp_account_id, c.is_group,
             ct.wa_id, ct.jid_type,
             g.group_jid
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE m.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [req.params.messageId, agentId]);

    if (!originalMessage) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (!originalMessage.wa_message_id) {
      res.status(400).json({ error: 'Cannot forward a message that was not sent via WhatsApp' });
      return;
    }

    // Get target conversation details
    const targetConversation = await queryOne<{
      id: string;
      whatsapp_account_id: string;
      is_group: boolean;
      wa_id: string | null;
      jid_type: string | null;
      group_jid: string | null;
      permission: string;
    }>(`
      SELECT c.id, c.whatsapp_account_id, c.is_group,
             ct.wa_id, ct.jid_type,
             g.group_jid,
             CASE WHEN wa.user_id = $2 THEN 'owner' ELSE aa.permission END as permission
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [targetConversationId, agentId]);

    if (!targetConversation) {
      res.status(404).json({ error: 'Target conversation not found' });
      return;
    }

    // Check permission - only owner, full, or send can forward messages
    if (!['owner', 'full', 'send'].includes(targetConversation.permission)) {
      res.status(403).json({ error: 'You do not have permission to send messages to this conversation' });
      return;
    }

    // Source and target must be on same WhatsApp account
    if (originalMessage.whatsapp_account_id !== targetConversation.whatsapp_account_id) {
      res.status(400).json({ error: 'Cannot forward messages across different WhatsApp accounts' });
      return;
    }

    // Construct target JID
    const targetJid = targetConversation.is_group
      ? targetConversation.group_jid
      : `${targetConversation.wa_id}@${(targetConversation.jid_type || 'pn') === 'lid' ? 'lid' : 's.whatsapp.net'}`;

    if (!targetJid) {
      res.status(400).json({ error: 'Could not determine target JID' });
      return;
    }

    // Construct message key for forwarding
    const originalRemoteJid = originalMessage.is_group
      ? originalMessage.group_jid
      : `${originalMessage.wa_id}@${(originalMessage.jid_type || 'pn') === 'lid' ? 'lid' : 's.whatsapp.net'}`;

    const messageKey = {
      remoteJid: originalRemoteJid!,
      id: originalMessage.wa_message_id,
      fromMe: originalMessage.sender_type === 'agent',
      // For group messages from others, include participant
      ...(originalMessage.is_group && originalMessage.sender_type === 'contact' && originalMessage.sender_jid && {
        participant: originalMessage.sender_jid,
      }),
    };

    // Get agent name for the forwarded message record
    const agent = await queryOne('SELECT name FROM users WHERE id = $1', [agentId]);

    // Create pending message record for the forwarded message
    const forwardedDbMessage = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id)
      VALUES ($1, 'agent', $2, $3, $4, $5, 'pending', $6)
      RETURNING *
    `, [
      targetConversationId,
      originalMessage.content_type,
      originalMessage.content ? `[Forwarded] ${originalMessage.content}` : '[Forwarded message]',
      originalMessage.media_url,
      originalMessage.media_mime_type,
      agentId
    ]);

    // Update target conversation
    await execute(`
      UPDATE conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [targetConversationId]);

    // Emit message:new immediately (optimistic UI)
    const io = getIO();
    io.to(`account:${targetConversation.whatsapp_account_id}`).emit('message:new', {
      accountId: targetConversation.whatsapp_account_id,
      conversationId: targetConversationId,
      message: {
        ...forwardedDbMessage,
        agent_name: agent?.name,
      },
    });

    // Return immediately
    res.status(201).json({
      success: true,
      forwardedMessageId: forwardedDbMessage!.id,
      targetConversationId,
    });

    // Forward in background
    (async () => {
      try {
        const waMessageId = await sessionManager.forwardMessage(
          targetConversation.whatsapp_account_id,
          targetJid,
          messageKey,
          originalMessage.raw_message // Pass raw message for fallback
        );

        // Update with WhatsApp ID
        await execute(`
          UPDATE messages SET wa_message_id = $1, status = 'sent', updated_at = NOW()
          WHERE id = $2
        `, [waMessageId, forwardedDbMessage!.id]);

        // Emit success
        io.to(`account:${targetConversation.whatsapp_account_id}`).emit('message:status', {
          accountId: targetConversation.whatsapp_account_id,
          messageId: forwardedDbMessage!.id,
          waMessageId,
          status: 'sent',
        });

        console.log(`[Messages] Forwarded message ${req.params.messageId} to ${targetConversationId}, new WA ID: ${waMessageId}`);

      } catch (error: any) {
        console.error('Forward message error:', error);

        await execute(`
          UPDATE messages SET status = 'failed', updated_at = NOW()
          WHERE id = $1
        `, [forwardedDbMessage!.id]);

        io.to(`account:${targetConversation.whatsapp_account_id}`).emit('message:status', {
          accountId: targetConversation.whatsapp_account_id,
          messageId: forwardedDbMessage!.id,
          status: 'failed',
          error: error.message,
        });
      }
    })();

  } catch (error: any) {
    console.error('Forward message error:', error);
    res.status(500).json({ error: error.message || 'Failed to forward message' });
  }
});

export default router;
