import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { Account } from '../types';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getAntiBanStats, ANTI_BAN_CONFIG } from '../services/antiBan';
import { hasAccountAccess, canSendMessages } from '../helpers/accountAccess';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List user's accounts (owned + shared) - supports channel_type filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const channelType = req.query.channel_type as string | undefined;
    const channelFilter = channelType ? `AND channel_type = $2` : '';
    const params = channelType ? [req.user!.userId, channelType] : [req.user!.userId];

    // Get owned accounts
    const ownedAccounts = await query<Account & { is_owner: boolean; permission: string }>(
      `SELECT id, phone_number, name, status, channel_type, channel_identifier,
              incognito_mode, show_channel_name, channel_display_name,
              credentials, settings, created_at, updated_at,
              TRUE as is_owner, 'owner' as permission
       FROM accounts
       WHERE user_id = $1 ${channelFilter}`,
      params
    );

    // Get shared accounts (accounts this user has access to but doesn't own)
    const sharedAccounts = await query<Account & { is_owner: boolean; permission: string; owner_name: string }>(
      `SELECT a.id, a.phone_number, a.name, a.status, a.channel_type, a.channel_identifier,
              a.incognito_mode, a.show_channel_name, a.channel_display_name,
              a.credentials, a.settings, a.created_at, a.updated_at,
              FALSE as is_owner, aa.permission, u.name as owner_name
       FROM accounts a
       JOIN account_access aa ON a.id = aa.account_id
       JOIN users u ON a.user_id = u.id
       WHERE aa.agent_id = $1 ${channelFilter}`,
      params
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

    // Create account record (WhatsApp by default)
    const account = await queryOne<Account>(
      `INSERT INTO accounts (user_id, name, status, channel_type)
       VALUES ($1, $2, 'qr_pending', 'whatsapp')
       RETURNING id, phone_number, name, status, channel_type, created_at`,
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
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = await queryOne<Account>(
      `SELECT id, phone_number, name, status, channel_type, channel_identifier,
              incognito_mode, show_channel_name, channel_display_name,
              credentials, settings, created_at, updated_at
       FROM accounts
       WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      account,
      is_owner: access.isOwner,
      permission: access.permission,
    });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Update account settings
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, incognitoMode, showChannelName, channelDisplayName } = req.body;

    // Check ownership (only owners can update settings)
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can update settings' });
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

    const account = await queryOne<Account>(`
      UPDATE accounts
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, phone_number, name, status, channel_type, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at
    `, params);

    res.json({ account });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Bulk update incognito mode for all user's WhatsApp accounts
router.patch('/bulk/incognito', async (req: Request, res: Response) => {
  try {
    const { incognitoMode } = req.body;

    if (typeof incognitoMode !== 'boolean') {
      res.status(400).json({ error: 'incognitoMode must be a boolean' });
      return;
    }

    // Update all WhatsApp accounts owned by this user
    await execute(
      `UPDATE accounts SET incognito_mode = $1, updated_at = NOW()
       WHERE user_id = $2 AND channel_type = 'whatsapp'`,
      [incognitoMode, req.user!.userId]
    );

    // Get updated accounts
    const accounts = await query<Account>(
      `SELECT id, phone_number, name, status, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at
       FROM accounts WHERE user_id = $1 AND channel_type = 'whatsapp'`,
      [req.user!.userId]
    );

    // Update incognito mode for all active sessions
    for (const account of accounts) {
      sessionManager.updateIncognitoMode(account.id, incognitoMode);
    }

    console.log(`[Accounts] Bulk incognito mode set to ${incognitoMode} for user ${req.user!.userId} (${accounts.length} accounts)`);

    res.json({ success: true, incognitoMode, accountsUpdated: accounts.length });
  } catch (error) {
    console.error('Bulk incognito update error:', error);
    res.status(500).json({ error: 'Failed to update incognito mode' });
  }
});

// Get incognito status for user's accounts
router.get('/bulk/incognito', async (req: Request, res: Response) => {
  try {
    // Check if ANY WhatsApp account has incognito mode on
    const result = await queryOne<{ any_incognito: boolean }>(
      `SELECT bool_or(incognito_mode) as any_incognito FROM accounts
       WHERE user_id = $1 AND channel_type = 'whatsapp'`,
      [req.user!.userId]
    );

    res.json({ incognitoMode: result?.any_incognito || false });
  } catch (error) {
    console.error('Get incognito status error:', error);
    res.status(500).json({ error: 'Failed to get incognito status' });
  }
});

// Disconnect and remove account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Check ownership (only owners can delete)
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can delete account' });
      return;
    }

    // Disconnect session (for WhatsApp accounts)
    if (access.channelType === 'whatsapp') {
      await sessionManager.destroySession(req.params.id);
    }

    // Delete from database (cascades to contacts, conversations, messages)
    await execute(
      'DELETE FROM accounts WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Reconnect existing account (WhatsApp only)
router.post('/:id/reconnect', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (access.channelType !== 'whatsapp') {
      res.status(400).json({ error: 'Reconnect only available for WhatsApp accounts' });
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

// Get anti-ban statistics for an account (WhatsApp only)
router.get('/:id/anti-ban-stats', async (req: Request, res: Response) => {
  try {
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (access.channelType !== 'whatsapp') {
      res.status(400).json({ error: 'Anti-ban stats only available for WhatsApp accounts' });
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
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.isOwner) {
      res.status(403).json({ error: 'Only account owner can grant access' });
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
    console.error('Grant access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access from an agent (owner only)
router.delete('/:id/access/:agentId', async (req: Request, res: Response) => {
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
    const access = await hasAccountAccess(req.user!.userId, req.params.id);

    if (!access.hasAccess) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (access.channelType !== 'whatsapp') {
      res.status(400).json({ error: 'Group refresh only available for WhatsApp accounts' });
      return;
    }

    const accountId = req.params.id;

    // Get groups with placeholder names
    const placeholderGroups = await query(
      `SELECT id, group_jid, name FROM groups
       WHERE account_id = $1 AND name ~ '^Group [0-9]+$'`,
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
