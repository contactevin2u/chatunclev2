/**
 * Telegram Account Routes
 * Handles Telegram bot account management, messaging, and webhooks
 *
 * Architecture (UNIFIED):
 * - Uses unified 'accounts' table with channel_type = 'telegram'
 * - Uses account_access for multi-agent sharing (same as WhatsApp)
 * - Conversations/contacts link via account_id
 * - Socket rooms follow same pattern: account:${accountId}
 */

import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { telegramAdapter, ChannelAdapterFactory } from '../services/channel';
import { getIO } from '../services/socket';
import { hasAccountAccess, canSendMessages } from '../helpers/accountAccess';
import { processIncomingMessage } from '../services/IncomingMessageProcessor';

const router = Router();

// Register Telegram adapter with the factory
ChannelAdapterFactory.register(telegramAdapter);

// Set up global message handler for Telegram (using centralized processor)
telegramAdapter.onMessage(async (message) => {
  const result = await processIncomingMessage(message);
  if (!result.success && !result.isDuplicate) {
    console.error(`[TelegramRoute] Failed to process message: ${result.error}`);
  }
});

// Set up status change handler
telegramAdapter.onStatusChange((accountId, status, error) => {
  console.log(`[TelegramRoute] Status change for ${accountId}: ${status}${error ? ` (${error})` : ''}`);

  // Update database status (unified accounts table)
  execute(
    `UPDATE accounts SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, accountId]
  ).catch(err => console.error('[TelegramRoute] Failed to update status in DB:', err));

  // Emit to frontend - use SAME event name as WhatsApp for frontend compatibility
  const io = getIO();
  io.to(`account:${accountId}`).emit('account:status', {
    accountId,
    channelType: 'telegram',
    status,
    error,
  });
});

// ============================================================
// ROUTES
// ============================================================

// All routes require authentication
router.use(authenticate);

// List user's Telegram accounts (owned + shared, same pattern as WhatsApp accounts)
// Backward compatible: uses channel_accounts directly
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    // Get owned accounts from channel_accounts
    const ownedAccounts = await query(
      `SELECT id, channel_identifier, account_name, status, settings, created_at, updated_at,
              TRUE as is_owner, 'owner' as permission
       FROM channel_accounts
       WHERE user_id = $1 AND channel_type = 'telegram'
       ORDER BY created_at DESC`,
      [req.user!.userId]
    );

    // Get shared accounts (via channel_account_access)
    const sharedAccounts = await query(
      `SELECT ca.id, ca.channel_identifier, ca.account_name, ca.status, ca.settings, ca.created_at, ca.updated_at,
              FALSE as is_owner, caa.permission_level as permission, u.name as owner_name
       FROM channel_accounts ca
       JOIN channel_account_access caa ON ca.id = caa.channel_account_id
       JOIN users u ON ca.user_id = u.id
       WHERE caa.user_id = $1 AND ca.channel_type = 'telegram'
       ORDER BY ca.created_at DESC`,
      [req.user!.userId]
    );

    // Combine owned + shared
    const allAccounts = [...ownedAccounts, ...sharedAccounts];

    // Add bot info for connected accounts
    const accountsWithInfo = allAccounts.map(account => {
      const botInfo = telegramAdapter.getBotInfo(account.id);
      return {
        ...account,
        botInfo,
        isConnected: telegramAdapter.isConnected(account.id),
      };
    });

    res.json({ accounts: accountsWithInfo });
  } catch (error) {
    console.error('List Telegram accounts error:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// Add new Telegram bot account
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { botToken, accountName } = req.body;

    if (!botToken) {
      res.status(400).json({ error: 'botToken is required' });
      return;
    }

    // Validate token format (basic check)
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      res.status(400).json({ error: 'Invalid bot token format. Get it from @BotFather on Telegram.' });
      return;
    }

    // Create account record first (unified accounts table)
    const account = await queryOne<any>(
      `INSERT INTO accounts (user_id, channel_type, channel_identifier, name, credentials, status)
       VALUES ($1, 'telegram', $2, $3, $4, 'connecting')
       RETURNING *`,
      [req.user!.userId, 'pending', accountName || 'Telegram Bot', JSON.stringify({ botToken })]
    );

    if (!account) {
      res.status(500).json({ error: 'Failed to create account' });
      return;
    }

    try {
      // Try to connect the bot
      await telegramAdapter.connect(account.id, {
        credentials: { botToken },
      });

      // Get bot info and update the record
      const botInfo = telegramAdapter.getBotInfo(account.id);

      await execute(
        `UPDATE accounts SET channel_identifier = $1, name = $2, status = 'connected', last_connected_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [botInfo?.username || 'unknown', botInfo?.firstName || accountName || 'Telegram Bot', account.id]
      );

      res.status(201).json({
        account: {
          id: account.id,
          channelIdentifier: botInfo?.username,
          accountName: botInfo?.firstName || accountName,
          status: 'connected',
          botInfo,
          is_owner: true,
          permission: 'owner',
        },
      });
    } catch (connectError: any) {
      // Connection failed, delete the account record
      await execute('DELETE FROM accounts WHERE id = $1', [account.id]);
      res.status(400).json({
        error: 'Failed to connect bot. Check your token.',
        details: connectError.message,
      });
    }
  } catch (error) {
    console.error('Create Telegram account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get specific Telegram account (with access check)
router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = await queryOne(
      `SELECT id, channel_identifier, name as account_name, status, settings, created_at, updated_at
       FROM accounts
       WHERE id = $1 AND channel_type = 'telegram'`,
      [req.params.id]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const botInfo = telegramAdapter.getBotInfo(req.params.id);

    res.json({
      account: {
        ...account,
        botInfo,
        isConnected: telegramAdapter.isConnected(req.params.id),
        is_owner: access.isOwner,
        permission: access.permission,
      },
    });
  } catch (error) {
    console.error('Get Telegram account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Update Telegram account settings (owner only)
router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { accountName, settings } = req.body;

    // Check ownership
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can update settings' });
      return;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [req.params.id];
    let paramIndex = 2;

    if (accountName !== undefined) {
      params.push(accountName);
      updates.push(`name = $${paramIndex++}`);
    }

    if (settings !== undefined) {
      params.push(JSON.stringify(settings));
      updates.push(`settings = $${paramIndex++}`);
    }

    const account = await queryOne(`
      UPDATE accounts
      SET ${updates.join(', ')}
      WHERE id = $1 AND channel_type = 'telegram'
      RETURNING id, channel_identifier, name as account_name, status, settings, created_at, updated_at
    `, params);

    res.json({ account });
  } catch (error) {
    console.error('Update Telegram account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Disconnect and remove Telegram account (owner only)
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can delete account' });
      return;
    }

    // Disconnect the bot
    await telegramAdapter.disconnect(req.params.id);

    // Delete from database (cascades to access, conversations linked via account_id)
    await execute('DELETE FROM accounts WHERE id = $1', [req.params.id]);

    res.json({ message: 'Telegram account deleted' });
  } catch (error) {
    console.error('Delete Telegram account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Reconnect existing Telegram account (owner or full access)
router.post('/accounts/:id/reconnect', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess || !canSendMessages(access.permission)) {
      res.status(403).json({ error: 'Insufficient permissions to reconnect' });
      return;
    }

    const account = await queryOne<any>(
      `SELECT id, credentials FROM accounts
       WHERE id = $1 AND channel_type = 'telegram'`,
      [req.params.id]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Parse credentials
    let credentials: any;
    try {
      credentials = typeof account.credentials === 'string'
        ? JSON.parse(account.credentials)
        : account.credentials;
    } catch {
      res.status(500).json({ error: 'Invalid stored credentials' });
      return;
    }

    // Disconnect first if connected
    if (telegramAdapter.isConnected(req.params.id)) {
      await telegramAdapter.disconnect(req.params.id);
    }

    // Reconnect
    await telegramAdapter.connect(req.params.id, { credentials });

    // Update last_connected_at
    await execute(
      `UPDATE accounts SET last_connected_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Reconnection successful', status: 'connected' });
  } catch (error: any) {
    console.error('Reconnect Telegram error:', error);
    res.status(500).json({ error: 'Failed to reconnect', details: error.message });
  }
});

// Send message via Telegram (owner, full, or send permission)
router.post('/accounts/:id/send', async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      res.status(400).json({ error: 'chatId and message are required' });
      return;
    }

    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess || !canSendMessages(access.permission)) {
      res.status(403).json({ error: 'Insufficient permissions to send messages' });
      return;
    }

    // Check connection
    if (!telegramAdapter.isConnected(req.params.id)) {
      res.status(400).json({ error: 'Bot not connected' });
      return;
    }

    // Send message
    const result = await telegramAdapter.sendMessage(req.params.id, chatId, {
      type: message.type || 'text',
      content: message.content,
      mediaUrl: message.mediaUrl,
      caption: message.caption,
      latitude: message.latitude,
      longitude: message.longitude,
    }, {
      replyToMessageId: message.replyToMessageId,
    });

    if (result.success) {
      // Save sent message to database
      const conversation = await queryOne<any>(
        `SELECT id FROM conversations WHERE account_id = $1 AND telegram_chat_id = $2`,
        [req.params.id, chatId]
      );

      if (conversation) {
        const savedMessage = await queryOne<any>(
          `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, agent_id, channel_type)
           VALUES ($1, $2, 'agent', $3, $4, $5, 'telegram')
           RETURNING *`,
          [conversation.id, result.messageId, message.type || 'text', message.content || message.caption || '', req.user!.userId]
        );

        // Update conversation
        await execute(
          `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [conversation.id]
        );

        // Emit to all agents viewing this account
        const io = getIO();
        io.to(`account:${req.params.id}`).emit('message:new', {
          accountId: req.params.id,
          conversationId: conversation.id,
          channelType: 'telegram',
          message: savedMessage,
        });
      }

      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Send Telegram message error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Get Telegram conversations for an account (with access check)
router.get('/accounts/:id/conversations', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const conversations = await query(
      `SELECT c.*, ct.name as contact_name, ct.telegram_user_id,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.account_id = $1 AND c.channel_type = 'telegram'
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [req.params.id]
    );

    res.json({ conversations });
  } catch (error) {
    console.error('Get Telegram conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// ============================================================
// ACCOUNT ACCESS CONTROL (Multi-agent sharing)
// ============================================================

// List agents with access to a Telegram account (owner only)
router.get('/accounts/:id/access', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can view access list' });
      return;
    }

    const accessList = await query(
      `SELECT aa.id, aa.agent_id, aa.permission, aa.granted_at,
              u.name as agent_name, u.email as agent_email
       FROM account_access aa
       JOIN users u ON aa.agent_id = u.id
       WHERE aa.account_id = $1
       ORDER BY aa.granted_at DESC`,
      [req.params.id]
    );

    res.json({ access: accessList });
  } catch (error) {
    console.error('List Telegram access error:', error);
    res.status(500).json({ error: 'Failed to list access' });
  }
});

// Grant access to an agent (owner only)
router.post('/accounts/:id/access', async (req: Request, res: Response) => {
  try {
    const { agentEmail, permission = 'full' } = req.body;

    if (!agentEmail) {
      res.status(400).json({ error: 'agentEmail is required' });
      return;
    }

    if (!['full', 'send', 'view'].includes(permission)) {
      res.status(400).json({ error: 'Invalid permission. Use: full, send, or view' });
      return;
    }

    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can grant access' });
      return;
    }

    // Find agent by email
    const agent = await queryOne<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE email = $1',
      [agentEmail]
    );

    if (!agent) {
      res.status(404).json({ error: 'Agent not found with that email' });
      return;
    }

    if (agent.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot grant access to yourself (you are the owner)' });
      return;
    }

    // Grant or update access (using unified account_access table)
    const accessRecord = await queryOne(
      `INSERT INTO account_access (account_id, agent_id, permission, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, agent_id)
       DO UPDATE SET permission = $3, granted_at = NOW()
       RETURNING *`,
      [req.params.id, agent.id, permission, req.user!.userId]
    );

    res.status(201).json({
      message: `Access granted to ${agent.name}`,
      access: {
        ...accessRecord,
        agent_name: agent.name,
        agent_email: agent.email,
      },
    });
  } catch (error) {
    console.error('Grant Telegram access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access from an agent (owner only)
router.delete('/accounts/:id/access/:agentId', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can revoke access' });
      return;
    }

    const deletedCount = await execute(
      'DELETE FROM account_access WHERE account_id = $1 AND agent_id = $2',
      [req.params.id, req.params.agentId]
    );

    if (deletedCount === 0) {
      res.status(404).json({ error: 'Access record not found' });
      return;
    }

    res.json({ message: 'Access revoked' });
  } catch (error) {
    console.error('Revoke Telegram access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;
