import { Router, Request, Response } from 'express';
import { queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getIO } from '../services/socket';
import { Message } from '../types';
import { substituteTemplateVariables } from '../utils/templateVariables';

const router = Router();

router.use(authenticate);

// Send message to a new phone number (start new conversation)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { accountId, phoneNumber, content, contentType = 'text', mediaUrl, mediaMimeType } = req.body;
    const agentId = req.user!.userId;

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }
    if (!phoneNumber) {
      res.status(400).json({ error: 'phoneNumber is required' });
      return;
    }
    if (!content && !mediaUrl) {
      res.status(400).json({ error: 'content or mediaUrl is required' });
      return;
    }

    // Verify account ownership or shared access with send permission
    const account = await queryOne(`
      SELECT a.id, a.user_id,
             CASE WHEN a.user_id = $2 THEN 'owner' ELSE aa.permission END as permission
      FROM accounts a
      LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $2
      WHERE a.id = $1 AND (a.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [accountId, agentId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (!['owner', 'full', 'send'].includes(account.permission)) {
      res.status(403).json({ error: 'You do not have permission to send messages' });
      return;
    }

    // Clean phone number (remove +, spaces, dashes)
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    const waId = cleanPhone;

    // Check if contact already exists
    let contact = await queryOne(`
      SELECT id, wa_id FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2
    `, [accountId, waId]);

    if (!contact) {
      contact = await queryOne(`
        INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, jid_type)
        VALUES ($1, $2, $3, 'pn') RETURNING id, wa_id
      `, [accountId, waId, phoneNumber]);
      console.log(`[SendToPhone] Created new contact: ${contact.id} for phone ${phoneNumber}`);
    }

    // Check if conversation already exists
    let conversation = await queryOne(`
      SELECT id FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2
    `, [accountId, contact.id]);

    if (!conversation) {
      conversation = await queryOne(`
        INSERT INTO conversations (whatsapp_account_id, contact_id, is_group)
        VALUES ($1, $2, false) RETURNING id
      `, [accountId, contact.id]);
      console.log(`[SendToPhone] Created new conversation: ${conversation.id}`);
    }

    const agent = await queryOne('SELECT name FROM users WHERE id = $1', [agentId]);
    const processedContent = content ? substituteTemplateVariables(content, {
      contactName: '',
      contactPhone: phoneNumber,
      agentName: agent?.name || ''
    }) : content;

    const message = await queryOne<Message>(`
      INSERT INTO messages (conversation_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id)
      VALUES ($1, 'agent', $2, $3, $4, $5, 'pending', $6) RETURNING *
    `, [conversation.id, contentType, processedContent, mediaUrl, mediaMimeType, agentId]);

    await execute(`
      UPDATE conversations SET last_message_at = NOW(), updated_at = NOW(),
        first_response_at = COALESCE(first_response_at, NOW()),
        assigned_agent_id = COALESCE(assigned_agent_id, $2)
      WHERE id = $1
    `, [conversation.id, agentId]);

    res.status(201).json({
      message: { ...message, agent_name: agent?.name },
      conversation: { id: conversation.id, contact_id: contact.id }
    });

    // Send in background
    (async () => {
      try {
        const waMessageId = await sessionManager.sendMessage(accountId, waId, {
          type: contentType,
          content: processedContent,
          mediaUrl,
          mediaMimeType,
        }, { jidType: 'pn' });

        await execute(
          `UPDATE messages SET wa_message_id = $1, status = 'sent', updated_at = NOW() WHERE id = $2`,
          [waMessageId, message!.id]
        );
        // Emit to account room for multi-agent sync
        const io = getIO();
        io.to(`account:${accountId}`).emit('message:status', {
          accountId,
          messageId: message!.id,
          waMessageId,
          status: 'sent',
        });

        await execute(`
          INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
          VALUES ($1, 'message_sent_new_contact', 'conversation', $2, $3)
        `, [agentId, conversation.id, JSON.stringify({ phone_number: phoneNumber, content_type: contentType })]);
      } catch (error: any) {
        console.error('Background send to phone error:', error);
        await execute(
          `UPDATE messages SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [message!.id]
        );
        // Emit to account room for multi-agent sync
        const io = getIO();
        io.to(`account:${accountId}`).emit('message:status', {
          accountId,
          messageId: message!.id,
          status: 'failed',
          error: error.message,
        });
      }
    })();
  } catch (error) {
    console.error('Send to phone error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
