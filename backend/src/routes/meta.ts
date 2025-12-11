/**
 * Meta Routes (Instagram & Facebook Messenger)
 *
 * Unified routes for Meta's messaging platforms.
 * Handles both Instagram DM and Facebook Messenger via Graph API.
 *
 * Endpoints:
 * - GET/POST /webhook/:accountId - Webhook handlers
 * - GET /accounts - List user's Meta accounts
 * - POST /accounts - Connect new Meta account
 * - DELETE /accounts/:id - Disconnect account
 * - POST /accounts/:id/send - Send message
 * - GET/POST /accounts/:id/access - Manage account access
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { instagramAdapter, messengerAdapter } from '../services/channel/adapters/MetaAdapter';
import { ChannelAdapterFactory } from '../services/channel';
import { getIO } from '../services/socket';
import { processIncomingMessage } from '../services/IncomingMessageProcessor';

const router = Router();

// Raw body parser for webhook signature verification
const rawBodyParser = express.raw({ type: 'application/json' });

// Register adapters with the factory
ChannelAdapterFactory.register(instagramAdapter);
ChannelAdapterFactory.register(messengerAdapter);

// Helper to get the right adapter based on channel type
function getAdapter(channelType: 'instagram' | 'messenger') {
  return channelType === 'instagram' ? instagramAdapter : messengerAdapter;
}

// ============================================================
// MESSAGE HANDLER (shared by both Instagram and Messenger)
// Using centralized IncomingMessageProcessor
// ============================================================

// Set up global message handlers using centralized processor
const setupMessageHandler = (adapter: typeof instagramAdapter | typeof messengerAdapter, channelType: 'instagram' | 'messenger') => {
  adapter.onMessage(async (message) => {
    const result = await processIncomingMessage(message);
    if (!result.success && !result.isDuplicate) {
      console.error(`[MetaRoute] Failed to process ${channelType} message: ${result.error}`);
    }
  });
};

// Initialize message handlers
setupMessageHandler(instagramAdapter, 'instagram');
setupMessageHandler(messengerAdapter, 'messenger');

// ============================================================
// WEBHOOK ENDPOINTS
// ============================================================

// Webhook verification (GET) - Meta sends this to verify webhook URL
router.get('/webhook/:accountId', (req: Request, res: Response) => {
  const { accountId } = req.params;
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  // Get verify token from environment or account settings
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'chatuncle_meta_webhook';

  // Try both adapters
  let result = instagramAdapter.verifyWebhookChallenge(accountId, mode, token, challenge, verifyToken);
  if (!result) {
    result = messengerAdapter.verifyWebhookChallenge(accountId, mode, token, challenge, verifyToken);
  }

  if (result) {
    res.status(200).send(result);
  } else {
    res.status(403).send('Verification failed');
  }
});

// Webhook receiver (POST)
router.post('/webhook/:accountId', rawBodyParser, async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const signature = req.headers['x-hub-signature-256'] as string || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    // Parse body to determine channel type
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('[MetaRoute] Invalid JSON in webhook:', parseError);
      res.status(200).send('EVENT_RECEIVED');
      return;
    }
    const channelType = payload.object === 'instagram' ? 'instagram' : 'messenger';

    console.log(`[MetaRoute] Webhook received for ${channelType} account ${accountId}`);

    // Process with appropriate adapter
    const adapter = getAdapter(channelType as 'instagram' | 'messenger');
    await adapter.processWebhook(accountId, signature, rawBody);

    // Meta expects 200 OK
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('[MetaRoute] Webhook error:', error);
    res.status(200).send('EVENT_RECEIVED');  // Always return 200 to prevent retries
  }
});

// ============================================================
// AUTHENTICATED ROUTES
// ============================================================

// List user's Meta accounts (both Instagram and Messenger)
router.get('/accounts', authenticate, async (req: Request, res: Response) => {
  try {
    const { channelType } = req.query;  // Optional filter: 'instagram' or 'messenger'

    let whereClause = `WHERE (a.user_id = $1 OR aa.agent_id = $1) AND a.channel_type IN ('instagram', 'messenger')`;
    const params: any[] = [req.user!.userId];

    if (channelType === 'instagram' || channelType === 'messenger') {
      whereClause += ` AND a.channel_type = $2`;
      params.push(channelType);
    }

    const accounts = await query<any>(
      `SELECT DISTINCT a.*,
        a.user_id = $1 as is_owner,
        COALESCE(aa.permission, 'full') as permission
       FROM accounts a
       LEFT JOIN account_access aa ON a.id = aa.account_id
       ${whereClause}
       ORDER BY a.created_at DESC`,
      params
    );

    // Add connection status
    const accountsWithStatus = accounts.map(acc => {
      const adapter = getAdapter(acc.channel_type);
      return {
        ...acc,
        is_connected: adapter.isConnected(acc.id),
        credentials: undefined,  // Don't expose credentials
      };
    });

    res.json({ accounts: accountsWithStatus });
  } catch (error) {
    console.error('List Meta accounts error:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// Connect new Meta account
router.post('/accounts', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      channelType,  // 'instagram' or 'messenger'
      pageId,
      pageAccessToken,
      appSecret,
      instagramAccountId,
      accountName,
    } = req.body;

    if (!channelType || !['instagram', 'messenger'].includes(channelType)) {
      res.status(400).json({ error: 'channelType must be "instagram" or "messenger"' });
      return;
    }

    if (!pageId || !pageAccessToken || !appSecret) {
      res.status(400).json({ error: 'pageId, pageAccessToken, and appSecret are required' });
      return;
    }

    if (channelType === 'instagram' && !instagramAccountId) {
      res.status(400).json({ error: 'instagramAccountId is required for Instagram' });
      return;
    }

    // Check for existing account
    const existing = await queryOne<any>(
      `SELECT id FROM accounts WHERE user_id = $1 AND channel_type = $2 AND channel_identifier = $3`,
      [req.user!.userId, channelType, pageId]
    );

    if (existing) {
      res.status(400).json({ error: `${channelType} account already connected for this page` });
      return;
    }

    // Create account record (using unified accounts table)
    const account = await queryOne<any>(
      `INSERT INTO accounts (user_id, channel_type, channel_identifier, name, credentials, status)
       VALUES ($1, $2, $3, $4, $5, 'connecting')
       RETURNING *`,
      [
        req.user!.userId,
        channelType,
        pageId,
        accountName || `${channelType === 'instagram' ? 'Instagram' : 'Messenger'} ${pageId.slice(-6)}`,
        JSON.stringify({ pageId, pageAccessToken, appSecret, instagramAccountId })
      ]
    );

    if (!account) {
      res.status(500).json({ error: 'Failed to create account' });
      return;
    }

    // Connect via adapter
    const adapter = getAdapter(channelType);
    try {
      await adapter.connect(account.id, {
        credentials: { pageId, pageAccessToken, appSecret, instagramAccountId },
        settings: { channelType }
      });

      await execute(
        `UPDATE accounts SET status = 'connected', last_connected_at = NOW() WHERE id = $1`,
        [account.id]
      );

      // Get webhook URL
      const apiUrl = process.env.API_URL || 'https://chatuncle-api.onrender.com';
      const webhookUrl = `${apiUrl}/api/meta/webhook/${account.id}`;

      res.json({
        account: { ...account, credentials: undefined },
        webhookUrl,
        message: `Configure this webhook URL in your Meta Developer App for ${channelType}`,
      });

    } catch (connectError: any) {
      await execute(`DELETE FROM accounts WHERE id = $1`, [account.id]);
      res.status(400).json({ error: connectError.message });
    }

  } catch (error) {
    console.error('Create Meta account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get specific account
router.get('/accounts/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const account = await queryOne<any>(
      `SELECT a.*, a.user_id = $1 as is_owner
       FROM accounts a
       LEFT JOIN account_access aa ON a.id = aa.account_id AND aa.agent_id = $1
       WHERE a.id = $2 AND a.channel_type IN ('instagram', 'messenger')
         AND (a.user_id = $1 OR aa.agent_id IS NOT NULL)`,
      [req.user!.userId, req.params.id]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const adapter = getAdapter(account.channel_type);
    res.json({
      account: {
        ...account,
        credentials: undefined,
        is_connected: adapter.isConnected(account.id),
        page_info: adapter.getPageInfo(account.id),
      }
    });
  } catch (error) {
    console.error('Get Meta account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Update account
router.patch('/accounts/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { accountName, settings } = req.body;

    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND channel_type IN ('instagram', 'messenger')`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (accountName !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(accountName);
    }
    if (settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(settings));
    }

    if (updates.length === 0) {
      res.json({ account: { ...account, credentials: undefined } });
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const updated = await queryOne<any>(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json({ account: { ...updated, credentials: undefined } });
  } catch (error) {
    console.error('Update Meta account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/accounts/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND channel_type IN ('instagram', 'messenger')`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    // Disconnect adapter
    const adapter = getAdapter(account.channel_type);
    await adapter.disconnect(account.id);

    // Delete from database
    await execute(`DELETE FROM accounts WHERE id = $1`, [req.params.id]);

    res.json({ message: `${account.channel_type} account disconnected` });
  } catch (error) {
    console.error('Delete Meta account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Reconnect account
router.post('/accounts/:id/reconnect', authenticate, async (req: Request, res: Response) => {
  try {
    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND channel_type IN ('instagram', 'messenger')
       AND (user_id = $2 OR id IN (SELECT account_id FROM account_access WHERE agent_id = $2))`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const credentials = typeof account.credentials === 'string'
      ? JSON.parse(account.credentials)
      : account.credentials;

    const adapter = getAdapter(account.channel_type);

    // Disconnect first
    await adapter.disconnect(account.id);

    // Reconnect
    await adapter.connect(account.id, {
      credentials,
      settings: { channelType: account.channel_type }
    });

    await execute(
      `UPDATE accounts SET status = 'connected', last_connected_at = NOW() WHERE id = $1`,
      [account.id]
    );

    res.json({ message: 'Reconnected successfully', status: 'connected' });
  } catch (error: any) {
    console.error('Reconnect Meta account error:', error);
    res.status(500).json({ error: error.message || 'Failed to reconnect' });
  }
});

// Send message
router.post('/accounts/:id/send', authenticate, async (req: Request, res: Response) => {
  try {
    const { recipientId, message } = req.body;

    if (!recipientId || !message) {
      res.status(400).json({ error: 'recipientId and message are required' });
      return;
    }

    const account = await queryOne<any>(
      `SELECT a.* FROM accounts a
       LEFT JOIN account_access aa ON a.id = aa.account_id
       WHERE a.id = $1 AND a.channel_type IN ('instagram', 'messenger')
         AND (a.user_id = $2 OR (aa.agent_id = $2 AND aa.permission IN ('full', 'send')))`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or no send permission' });
      return;
    }

    const adapter = getAdapter(account.channel_type);

    if (!adapter.isConnected(account.id)) {
      res.status(400).json({ error: 'Account not connected' });
      return;
    }

    const result = await adapter.sendMessage(account.id, recipientId, {
      type: message.type || 'text',
      content: message.content,
      mediaUrl: message.mediaUrl,
    }, {
      metadata: {
        useHumanAgentTag: message.useHumanAgentTag || false,
      }
    });

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Send Meta message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============================================================
// ACCESS MANAGEMENT
// ============================================================

// List account access
router.get('/accounts/:id/access', authenticate, async (req: Request, res: Response) => {
  try {
    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND channel_type IN ('instagram', 'messenger')`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const access = await query<any>(
      `SELECT aa.*, u.name as agent_name, u.email as agent_email
       FROM account_access aa
       JOIN users u ON aa.agent_id = u.id
       WHERE aa.account_id = $1`,
      [req.params.id]
    );

    res.json({ access });
  } catch (error) {
    console.error('List Meta access error:', error);
    res.status(500).json({ error: 'Failed to list access' });
  }
});

// Grant access
router.post('/accounts/:id/access', authenticate, async (req: Request, res: Response) => {
  try {
    const { agentEmail, permission = 'full' } = req.body;

    if (!agentEmail) {
      res.status(400).json({ error: 'agentEmail is required' });
      return;
    }

    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND channel_type IN ('instagram', 'messenger')`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const agent = await queryOne<any>(`SELECT id, name, email FROM users WHERE email = $1`, [agentEmail]);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot grant access to yourself' });
      return;
    }

    const access = await queryOne<any>(
      `INSERT INTO account_access (account_id, agent_id, permission, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, agent_id) DO UPDATE SET permission = $3
       RETURNING *`,
      [req.params.id, agent.id, permission, req.user!.userId]
    );

    res.json({
      message: 'Access granted',
      access: { ...access, agent_name: agent.name, agent_email: agent.email }
    });
  } catch (error) {
    console.error('Grant Meta access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access
router.delete('/accounts/:id/access/:agentId', authenticate, async (req: Request, res: Response) => {
  try {
    const account = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND channel_type IN ('instagram', 'messenger')`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const existing = await queryOne<any>(
      `SELECT id FROM account_access WHERE account_id = $1 AND agent_id = $2`,
      [req.params.id, req.params.agentId]
    );

    if (!existing) {
      res.status(404).json({ error: 'Access record not found' });
      return;
    }

    await execute(
      `DELETE FROM account_access WHERE account_id = $1 AND agent_id = $2`,
      [req.params.id, req.params.agentId]
    );

    res.json({ message: 'Access revoked' });
  } catch (error) {
    console.error('Revoke Meta access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;
