import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { WhatsAppAccount } from '../types';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getAntiBanStats, ANTI_BAN_CONFIG } from '../services/antiBan';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List user's WhatsApp accounts (owned + shared)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get owned accounts
    const ownedAccounts = await query<WhatsAppAccount & { is_owner: boolean; permission: string }>(
      `SELECT id, phone_number, name, status, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at,
              TRUE as is_owner, 'owner' as permission
       FROM whatsapp_accounts
       WHERE user_id = $1`,
      [req.user!.userId]
    );

    // Get shared accounts (accounts this user has access to but doesn't own)
    const sharedAccounts = await query<WhatsAppAccount & { is_owner: boolean; permission: string; owner_name: string }>(
      `SELECT wa.id, wa.phone_number, wa.name, wa.status, wa.incognito_mode, wa.show_channel_name, wa.channel_display_name,
              wa.created_at, wa.updated_at,
              FALSE as is_owner, aa.permission, u.name as owner_name
       FROM whatsapp_accounts wa
       JOIN account_access aa ON wa.id = aa.whatsapp_account_id
       JOIN users u ON wa.user_id = u.id
       WHERE aa.agent_id = $1`,
      [req.user!.userId]
    );

    // Combine and sort by created_at
    const accounts = [...ownedAccounts, ...sharedAccounts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    res.json({ accounts });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// Start new WhatsApp connection
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    // Create account record
    const account = await queryOne<WhatsAppAccount>(
      `INSERT INTO whatsapp_accounts (user_id, name, status)
       VALUES ($1, $2, 'qr_pending')
       RETURNING id, phone_number, name, status, created_at`,
      [req.user!.userId, name || 'WhatsApp Account']
    );

    // Start session (QR will be sent via Socket.io)
    await sessionManager.createSession(account!.id, req.user!.userId);

    res.status(201).json({ account });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get specific account
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await queryOne<WhatsAppAccount>(
      `SELECT id, phone_number, name, status, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at
       FROM whatsapp_accounts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ account });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Update account settings
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, incognitoMode, showChannelName, channelDisplayName } = req.body;

    // Check ownership
    const existing = await queryOne<WhatsAppAccount>(
      'SELECT id FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!existing) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [req.params.id];
    let paramIndex = 2;

    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${paramIndex++}`);
    }

    if (incognitoMode !== undefined) {
      params.push(incognitoMode);
      updates.push(`incognito_mode = $${paramIndex++}`);
    }

    if (showChannelName !== undefined) {
      params.push(showChannelName);
      updates.push(`show_channel_name = $${paramIndex++}`);
    }

    if (channelDisplayName !== undefined) {
      params.push(channelDisplayName);
      updates.push(`channel_display_name = $${paramIndex++}`);
    }

    const account = await queryOne<WhatsAppAccount>(`
      UPDATE whatsapp_accounts
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, phone_number, name, status, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at
    `, params);

    res.json({ account });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Disconnect and remove account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Check ownership
    const account = await queryOne<WhatsAppAccount>(
      'SELECT id FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Disconnect session
    await sessionManager.destroySession(req.params.id);

    // Delete from database (cascades to contacts, conversations, messages)
    await execute(
      'DELETE FROM whatsapp_accounts WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Reconnect existing account
router.post('/:id/reconnect', async (req: Request, res: Response) => {
  try {
    const account = await queryOne<WhatsAppAccount>(
      'SELECT * FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Attempt reconnection
    await sessionManager.reconnectSession(req.params.id, req.user!.userId);

    res.json({ message: 'Reconnection initiated' });
  } catch (error) {
    console.error('Reconnect error:', error);
    res.status(500).json({ error: 'Failed to reconnect' });
  }
});

// Get anti-ban statistics for an account
router.get('/:id/anti-ban-stats', async (req: Request, res: Response) => {
  try {
    // Check ownership
    const account = await queryOne<WhatsAppAccount>(
      'SELECT id, created_at FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Get anti-ban statistics
    const stats = await getAntiBanStats(req.params.id);

    res.json({
      stats,
      config: {
        messagesPerMinute: ANTI_BAN_CONFIG.MESSAGES_PER_MINUTE,
        batchSize: ANTI_BAN_CONFIG.BATCH_SIZE,
        warmupPeriodDays: ANTI_BAN_CONFIG.WARMUP_PERIOD_DAYS,
      },
      recommendations: getRecommendations(stats),
    });
  } catch (error) {
    console.error('Get anti-ban stats error:', error);
    res.status(500).json({ error: 'Failed to get anti-ban stats' });
  }
});

// Get anti-ban configuration
router.get('/anti-ban/config', async (_req: Request, res: Response) => {
  res.json({
    config: ANTI_BAN_CONFIG,
    tips: [
      'New accounts should limit messaging to 20 contacts per day for the first week',
      'Add random delays between messages to appear more human-like',
      'Maintain a response rate of at least 30% to avoid spam detection',
      'Avoid sending identical messages to many contacts',
      'Personalize messages with contact names when possible',
    ],
  });
});

// Helper function for recommendations
function getRecommendations(stats: any): string[] {
  const recommendations: string[] = [];

  if (stats.isWarmupPeriod) {
    recommendations.push(
      `Account is in warm-up period (${stats.accountAgeDays} days old). Limit messaging activity to avoid bans.`
    );
  }

  if (stats.rateStatus === 'warning') {
    recommendations.push(
      `High usage detected (${stats.dailyNewContactsSent}/${stats.dailyLimit} daily limit). Consider slowing down.`
    );
  }

  if (stats.messagesLastMinute >= ANTI_BAN_CONFIG.MESSAGES_PER_MINUTE - 2) {
    recommendations.push(
      'Approaching rate limit. Messages will be automatically delayed.'
    );
  }

  if (stats.batchCount >= ANTI_BAN_CONFIG.BATCH_SIZE - 5) {
    recommendations.push(
      'Batch limit approaching. A cooldown period will be enforced soon.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Account is within safe messaging limits.');
  }

  return recommendations;
}

// ============================================================
// ACCOUNT ACCESS CONTROL (Multi-agent sharing)
// ============================================================

// List agents with access to an account (owner only)
router.get('/:id/access', async (req: Request, res: Response) => {
  try {
    // Only owner can view access list
    const account = await queryOne<WhatsAppAccount>(
      'SELECT id FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const accessList = await query(
      `SELECT aa.id, aa.agent_id, aa.permission, aa.granted_at,
              u.name as agent_name, u.email as agent_email
       FROM account_access aa
       JOIN users u ON aa.agent_id = u.id
       WHERE aa.whatsapp_account_id = $1
       ORDER BY aa.granted_at DESC`,
      [req.params.id]
    );

    res.json({ access: accessList });
  } catch (error) {
    console.error('List account access error:', error);
    res.status(500).json({ error: 'Failed to list account access' });
  }
});

// Grant access to an agent (owner only)
router.post('/:id/access', async (req: Request, res: Response) => {
  try {
    const { agentEmail, permission = 'full' } = req.body;

    if (!agentEmail) {
      res.status(400).json({ error: 'agentEmail is required' });
      return;
    }

    // Valid permissions: 'full', 'send', 'view'
    if (!['full', 'send', 'view'].includes(permission)) {
      res.status(400).json({ error: 'Invalid permission. Use: full, send, or view' });
      return;
    }

    // Only owner can grant access
    const account = await queryOne<WhatsAppAccount>(
      'SELECT id, name FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    // Find the agent by email
    const agent = await queryOne<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE email = $1',
      [agentEmail]
    );

    if (!agent) {
      res.status(404).json({ error: 'Agent not found with that email' });
      return;
    }

    // Can't grant access to yourself
    if (agent.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot grant access to yourself (you are the owner)' });
      return;
    }

    // Grant or update access
    const access = await queryOne(
      `INSERT INTO account_access (whatsapp_account_id, agent_id, permission, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (whatsapp_account_id, agent_id)
       DO UPDATE SET permission = $3, granted_at = NOW()
       RETURNING *`,
      [req.params.id, agent.id, permission, req.user!.userId]
    );

    res.status(201).json({
      message: `Access granted to ${agent.name}`,
      access: {
        ...access,
        agent_name: agent.name,
        agent_email: agent.email,
      },
    });
  } catch (error) {
    console.error('Grant access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access from an agent (owner only)
router.delete('/:id/access/:agentId', async (req: Request, res: Response) => {
  try {
    // Only owner can revoke access
    const account = await queryOne<WhatsAppAccount>(
      'SELECT id FROM whatsapp_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found or not owner' });
      return;
    }

    const deletedCount = await execute(
      'DELETE FROM account_access WHERE whatsapp_account_id = $1 AND agent_id = $2',
      [req.params.id, req.params.agentId]
    );

    if (deletedCount === 0) {
      res.status(404).json({ error: 'Access record not found' });
      return;
    }

    res.json({ message: 'Access revoked' });
  } catch (error) {
    console.error('Revoke access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// List all agents (for access management dropdown) - returns all non-admin agents
router.get('/agents/list', async (req: Request, res: Response) => {
  try {
    const agents = await query(
      `SELECT id, name, email FROM users WHERE id != $1 ORDER BY name`,
      [req.user!.userId]
    );

    res.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Refresh group names - fetches metadata from WhatsApp for groups with placeholder names
router.post('/:id/refresh-groups', async (req: Request, res: Response) => {
  try {
    // Check ownership or access
    const account = await queryOne<WhatsAppAccount>(
      `SELECT wa.id FROM whatsapp_accounts wa
       LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
       WHERE wa.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)`,
      [req.params.id, req.user!.userId]
    );

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const accountId = req.params.id;

    // Get groups with placeholder names
    const placeholderGroups = await query(
      `SELECT id, group_jid, name FROM groups
       WHERE whatsapp_account_id = $1 AND name ~ '^Group [0-9]+$'`,
      [accountId]
    );

    console.log(`[Groups] Found ${placeholderGroups.length} groups with placeholder names`);

    let updated = 0;
    let failed = 0;

    for (const group of placeholderGroups) {
      try {
        const metadata = await sessionManager.getGroupMetadata(accountId, group.group_jid);
        if (metadata?.subject) {
          await execute(
            `UPDATE groups SET name = $1, description = $2, participant_count = $3, updated_at = NOW()
             WHERE id = $4`,
            [metadata.subject, metadata.desc || null, metadata.participants?.length || 0, group.id]
          );
          console.log(`[Groups] Updated "${group.name}" -> "${metadata.subject}"`);
          updated++;
        }
      } catch (err) {
        console.log(`[Groups] Failed to fetch metadata for ${group.group_jid}:`, err);
        failed++;
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({
      message: `Refreshed ${updated} group names, ${failed} failed`,
      total: placeholderGroups.length,
      updated,
      failed,
    });
  } catch (error) {
    console.error('Refresh groups error:', error);
    res.status(500).json({ error: 'Failed to refresh groups' });
  }
});

export default router;
