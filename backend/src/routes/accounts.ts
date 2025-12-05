import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { WhatsAppAccount } from '../types';
import { sessionManager } from '../services/whatsapp/SessionManager';
import { getAntiBanStats, ANTI_BAN_CONFIG } from '../services/antiBan';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List user's WhatsApp accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await query<WhatsAppAccount>(
      `SELECT id, phone_number, name, status, incognito_mode, show_channel_name, channel_display_name, created_at, updated_at
       FROM whatsapp_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.userId]
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

export default router;
