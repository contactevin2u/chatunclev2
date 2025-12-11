/**
 * TikTok Shop Routes
 * Handles TikTok Shop account management, messaging, and webhooks
 *
 * Architecture (UNIFIED):
 * - Uses unified 'accounts' table with channel_type = 'tiktok'
 * - Uses account_access for multi-agent sharing (same as WhatsApp)
 * - Conversations/contacts link via account_id
 * - Socket rooms follow same pattern: account:${accountId}
 *
 * API Documentation: https://partner.tiktokshop.com/docv2/page/customer-service-api-overview
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { tiktokAdapter, ChannelAdapterFactory } from '../services/channel';
import { getIO } from '../services/socket';
import { hasAccountAccess, canSendMessages } from '../helpers/accountAccess';
import { processIncomingMessage } from '../services/IncomingMessageProcessor';

const router = Router();

// Raw body parser for webhook signature verification
// Must be applied BEFORE the JSON parser for webhook routes
const rawBodyParser = express.raw({ type: 'application/json' });

// Register TikTok adapter with the factory
ChannelAdapterFactory.register(tiktokAdapter);

// Set up global message handler for TikTok (using centralized processor)
tiktokAdapter.onMessage(async (message) => {
  const result = await processIncomingMessage(message);
  if (!result.success && !result.isDuplicate) {
    console.error(`[TikTokRoute] Failed to process message: ${result.error}`);
  }
});

// Set up status change handler
tiktokAdapter.onStatusChange((accountId, status, error) => {
  console.log(`[TikTokRoute] Status change for ${accountId}: ${status}${error ? ` (${error})` : ''}`);

  // Update database status (unified accounts table)
  execute(
    `UPDATE accounts SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, accountId]
  ).catch(err => console.error('[TikTokRoute] Failed to update status in DB:', err));

  // Emit to frontend - use SAME event name as WhatsApp/Telegram for frontend compatibility
  const io = getIO();
  io.to(`account:${accountId}`).emit('account:status', {
    accountId,
    channelType: 'tiktok',
    status,
    error,
  });
});

// ============================================================
// WEBHOOK ENDPOINT (Public - no auth, uses signature verification)
// ============================================================

// TikTok Shop webhook receiver
// Uses raw body parser for signature verification
router.post('/webhook/:accountId', rawBodyParser, async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    // TikTok sends signature in various header formats
    const signature = (req.headers['x-tts-signature'] ||
                       req.headers['tiktok-signature'] ||
                       req.headers['x-tiktok-signature']) as string || '';
    const timestamp = (req.headers['x-tts-timestamp'] ||
                       req.headers['tiktok-timestamp']) as string || '';

    // Get raw body as string for signature verification
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    console.log(`[TikTokRoute] Webhook received for account ${accountId}, signature: ${signature ? 'present' : 'missing'}`);

    // Process webhook (includes signature verification)
    await tiktokAdapter.processWebhook(accountId, signature, timestamp, rawBody);

    // TikTok expects 200 OK response
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[TikTokRoute] Webhook error:', error);
    // Still return 200 to prevent TikTok from retrying
    res.status(200).json({ success: false });
  }
});

// ============================================================
// AUTHENTICATED ROUTES
// ============================================================

router.use(authenticate);

// List user's TikTok Shop accounts (owned + shared)
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    // Get owned accounts
    const ownedAccounts = await query(
      `SELECT id, channel_identifier, name as account_name, status, settings, created_at, updated_at,
              TRUE as is_owner, 'owner' as permission
       FROM accounts
       WHERE user_id = $1 AND channel_type = 'tiktok'
       ORDER BY created_at DESC`,
      [req.user!.userId]
    );

    // Get shared accounts (via account_access)
    const sharedAccounts = await query(
      `SELECT a.id, a.channel_identifier, a.name as account_name, a.status, a.settings, a.created_at, a.updated_at,
              FALSE as is_owner, aa.permission, u.name as owner_name
       FROM accounts a
       JOIN account_access aa ON a.id = aa.account_id
       JOIN users u ON a.user_id = u.id
       WHERE aa.agent_id = $1 AND a.channel_type = 'tiktok'
       ORDER BY a.created_at DESC`,
      [req.user!.userId]
    );

    // Combine owned + shared
    const allAccounts = [...ownedAccounts, ...sharedAccounts];

    // Add shop info for connected accounts
    const accountsWithInfo = allAccounts.map(account => {
      const shopInfo = tiktokAdapter.getShopInfo(account.id);
      return {
        ...account,
        shopInfo,
        isConnected: tiktokAdapter.isConnected(account.id),
      };
    });

    res.json({ accounts: accountsWithInfo });
  } catch (error) {
    console.error('List TikTok accounts error:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// Add new TikTok Shop account (after OAuth flow)
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { appKey, appSecret, accessToken, refreshToken, shopId, shopCipher, accountName } = req.body;

    if (!appKey || !appSecret) {
      res.status(400).json({ error: 'appKey and appSecret are required' });
      return;
    }

    if (!accessToken || !refreshToken) {
      res.status(400).json({ error: 'accessToken and refreshToken are required. Complete OAuth flow first.' });
      return;
    }

    if (!shopId || !shopCipher) {
      res.status(400).json({ error: 'shopId and shopCipher are required' });
      return;
    }

    // Create account record first (unified accounts table)
    const account = await queryOne<any>(
      `INSERT INTO accounts (user_id, channel_type, channel_identifier, name, credentials, status)
       VALUES ($1, 'tiktok', $2, $3, $4, 'connecting')
       RETURNING *`,
      [
        req.user!.userId,
        shopId,
        accountName || `TikTok Shop ${shopId.slice(-6)}`,
        JSON.stringify({ appKey, appSecret, accessToken, refreshToken, shopId, shopCipher, tokenExpiresAt: 0 })
      ]
    );

    if (!account) {
      res.status(500).json({ error: 'Failed to create account' });
      return;
    }

    try {
      // Try to connect
      await tiktokAdapter.connect(account.id, {
        credentials: { appKey, appSecret, accessToken, refreshToken, shopId, shopCipher },
      });

      // Update status to connected
      await execute(
        `UPDATE accounts SET status = 'connected', last_connected_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [account.id]
      );

      res.status(201).json({
        account: {
          id: account.id,
          channelIdentifier: shopId,
          accountName: account.name,
          status: 'connected',
          shopInfo: tiktokAdapter.getShopInfo(account.id),
          is_owner: true,
          permission: 'owner',
        },
        webhookUrl: `${process.env.API_URL || 'https://chatuncle-api.onrender.com'}/api/tiktok/webhook/${account.id}`,
      });
    } catch (connectError: any) {
      // Connection failed, delete the account record
      await execute('DELETE FROM accounts WHERE id = $1', [account.id]);
      res.status(400).json({
        error: 'Failed to connect shop. Check your credentials.',
        details: connectError.message,
      });
    }
  } catch (error) {
    console.error('Create TikTok account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get specific TikTok account (with access check)
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
       WHERE id = $1 AND channel_type = 'tiktok'`,
      [req.params.id]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const shopInfo = tiktokAdapter.getShopInfo(req.params.id);

    res.json({
      account: {
        ...account,
        shopInfo,
        isConnected: tiktokAdapter.isConnected(req.params.id),
        is_owner: access.isOwner,
        permission: access.permission,
      },
    });
  } catch (error) {
    console.error('Get TikTok account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Update TikTok account settings (owner only)
router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { accountName, settings } = req.body;

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
      WHERE id = $1 AND channel_type = 'tiktok'
      RETURNING id, channel_identifier, name as account_name, status, settings, created_at, updated_at
    `, params);

    res.json({ account });
  } catch (error) {
    console.error('Update TikTok account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Disconnect and remove TikTok account (owner only)
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can delete account' });
      return;
    }

    // Disconnect
    await tiktokAdapter.disconnect(req.params.id);

    // Delete from database (cascades to access, conversations linked via account_id)
    await execute('DELETE FROM accounts WHERE id = $1', [req.params.id]);

    res.json({ message: 'TikTok Shop account deleted' });
  } catch (error) {
    console.error('Delete TikTok account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Reconnect existing TikTok account (owner or full access)
router.post('/accounts/:id/reconnect', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess || !canSendMessages(access.permission)) {
      res.status(403).json({ error: 'Insufficient permissions to reconnect' });
      return;
    }

    const account = await queryOne<any>(
      `SELECT id, credentials FROM accounts
       WHERE id = $1 AND channel_type = 'tiktok'`,
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
    if (tiktokAdapter.isConnected(req.params.id)) {
      await tiktokAdapter.disconnect(req.params.id);
    }

    // Reconnect
    await tiktokAdapter.connect(req.params.id, { credentials });

    // Update last_connected_at
    await execute(
      `UPDATE accounts SET last_connected_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Reconnection successful', status: 'connected' });
  } catch (error: any) {
    console.error('Reconnect TikTok error:', error);
    res.status(500).json({ error: 'Failed to reconnect', details: error.message });
  }
});

// Send message via TikTok Shop (owner, full, or send permission)
router.post('/accounts/:id/send', async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      res.status(400).json({ error: 'conversationId and message are required' });
      return;
    }

    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess || !canSendMessages(access.permission)) {
      res.status(403).json({ error: 'Insufficient permissions to send messages' });
      return;
    }

    // Check connection
    if (!tiktokAdapter.isConnected(req.params.id)) {
      res.status(400).json({ error: 'Shop not connected' });
      return;
    }

    // Send message
    const result = await tiktokAdapter.sendMessage(req.params.id, conversationId, {
      type: message.type || 'text',
      content: message.content,
      mediaUrl: message.mediaUrl,
      caption: message.caption,
    });

    if (result.success) {
      // Save sent message to database
      const conversation = await queryOne<any>(
        `SELECT id FROM conversations WHERE account_id = $1 AND tiktok_conversation_id = $2`,
        [req.params.id, conversationId]
      );

      if (conversation) {
        const savedMessage = await queryOne<any>(
          `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, agent_id, channel_type)
           VALUES ($1, $2, 'agent', $3, $4, $5, 'tiktok')
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
          channelType: 'tiktok',
          message: savedMessage,
        });
      }

      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Send TikTok message error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Get TikTok conversations for an account (with access check)
router.get('/accounts/:id/conversations', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const conversations = await query(
      `SELECT c.*, ct.name as contact_name, ct.tiktok_user_id,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.account_id = $1 AND c.channel_type = 'tiktok'
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [req.params.id]
    );

    res.json({ conversations });
  } catch (error) {
    console.error('Get TikTok conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// ============================================================
// ACCOUNT ACCESS CONTROL (Multi-agent sharing)
// ============================================================

// List agents with access to a TikTok account (owner only)
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
    console.error('List TikTok access error:', error);
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
    console.error('Grant TikTok access error:', error);
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
    console.error('Revoke TikTok access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;
