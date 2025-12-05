import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get analytics overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { accountId, startDate, endDate, agentId } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let accountFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Build account filter
    if (accountId) {
      params.push(accountId);
      accountFilter = `AND wa.id = $${paramIndex++}`;
    } else if (!isAdmin) {
      params.push(userId);
      accountFilter = `AND wa.user_id = $${paramIndex++}`;
    }

    // Date filters
    let dateFilter = '';
    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND m.created_at >= $${paramIndex++}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND m.created_at <= $${paramIndex++}`;
    }

    // Agent filter (admin only)
    let agentFilter = '';
    if (isAdmin && agentId) {
      params.push(agentId);
      agentFilter = ` AND m.agent_id = $${paramIndex++}`;
    }

    // Total messages sent by agents
    const sentResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.sender_type = 'agent' ${accountFilter} ${dateFilter} ${agentFilter}
    `, params);

    // Total messages received from contacts
    const receivedResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.sender_type = 'contact' ${accountFilter} ${dateFilter}
    `, params.slice(0, accountId ? 1 : (!isAdmin ? 1 : 0)));

    // Total conversations
    const conversationsResult = await queryOne(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE 1=1 ${accountFilter}
    `, params.slice(0, accountId ? 1 : (!isAdmin ? 1 : 0)));

    // Average response time
    const avgResponseResult = await queryOne(`
      SELECT AVG(m.response_time_ms) as avg_time
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.sender_type = 'agent'
        AND m.response_time_ms IS NOT NULL
        ${accountFilter} ${dateFilter} ${agentFilter}
    `, params);

    // First response time average
    const firstResponseResult = await queryOne(`
      SELECT AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) * 1000) as avg_time
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.first_response_at IS NOT NULL ${accountFilter}
    `, params.slice(0, accountId ? 1 : (!isAdmin ? 1 : 0)));

    // Response rate (conversations with at least one agent reply / total conversations)
    const responseRateResult = await queryOne(`
      SELECT
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_type = 'agent'
        ) THEN c.id END)::float / NULLIF(COUNT(DISTINCT c.id), 0) * 100 as rate
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE 1=1 ${accountFilter}
    `, params.slice(0, accountId ? 1 : (!isAdmin ? 1 : 0)));

    // Auto-reply count
    const autoReplyResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.is_auto_reply = TRUE ${accountFilter} ${dateFilter}
    `, params.slice(0, accountId ? 1 : (!isAdmin ? 1 : 0)));

    res.json({
      total_messages_sent: parseInt(sentResult?.count || '0'),
      total_messages_received: parseInt(receivedResult?.count || '0'),
      total_conversations: parseInt(conversationsResult?.count || '0'),
      avg_response_time_ms: Math.round(parseFloat(avgResponseResult?.avg_time || '0')),
      first_response_time_avg_ms: Math.round(parseFloat(firstResponseResult?.avg_time || '0')),
      response_rate: Math.round(parseFloat(responseRateResult?.rate || '0') * 100) / 100,
      auto_reply_count: parseInt(autoReplyResult?.count || '0'),
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to get analytics overview' });
  }
});

// Get messages by agent
router.get('/by-agent', async (req: Request, res: Response) => {
  try {
    const { accountId, startDate, endDate } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let accountFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (accountId) {
      params.push(accountId);
      accountFilter = `AND wa.id = $${paramIndex++}`;
    } else if (!isAdmin) {
      params.push(userId);
      accountFilter = `AND wa.user_id = $${paramIndex++}`;
    }

    let dateFilter = '';
    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND m.created_at >= $${paramIndex++}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND m.created_at <= $${paramIndex++}`;
    }

    const result = await query(`
      SELECT
        u.id as agent_id,
        u.name as agent_name,
        COUNT(m.id) as message_count,
        AVG(m.response_time_ms) as avg_response_time,
        COUNT(CASE WHEN m.is_auto_reply = FALSE THEN 1 END) as manual_replies,
        COUNT(CASE WHEN m.is_auto_reply = TRUE THEN 1 END) as auto_replies
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN users u ON m.agent_id = u.id
      WHERE m.sender_type = 'agent' ${accountFilter} ${dateFilter}
      GROUP BY u.id, u.name
      ORDER BY message_count DESC
    `, params);

    res.json({ agents: result });
  } catch (error) {
    console.error('Analytics by-agent error:', error);
    res.status(500).json({ error: 'Failed to get agent analytics' });
  }
});

// Get messages by day
router.get('/by-day', async (req: Request, res: Response) => {
  try {
    const { accountId, days = 30 } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let accountFilter = '';
    const params: any[] = [parseInt(days as string)];
    let paramIndex = 2;

    if (accountId) {
      params.push(accountId);
      accountFilter = `AND wa.id = $${paramIndex++}`;
    } else if (!isAdmin) {
      params.push(userId);
      accountFilter = `AND wa.user_id = $${paramIndex++}`;
    }

    const result = await query(`
      SELECT
        DATE(m.created_at) as date,
        COUNT(CASE WHEN m.sender_type = 'agent' THEN 1 END) as sent,
        COUNT(CASE WHEN m.sender_type = 'contact' THEN 1 END) as received
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.created_at >= NOW() - INTERVAL '1 day' * $1 ${accountFilter}
      GROUP BY DATE(m.created_at)
      ORDER BY date ASC
    `, params);

    res.json({ data: result });
  } catch (error) {
    console.error('Analytics by-day error:', error);
    res.status(500).json({ error: 'Failed to get daily analytics' });
  }
});

// Get response time distribution
router.get('/response-times', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let accountFilter = '';
    const params: any[] = [];

    if (accountId) {
      params.push(accountId);
      accountFilter = `AND wa.id = $1`;
    } else if (!isAdmin) {
      params.push(userId);
      accountFilter = `AND wa.user_id = $1`;
    }

    const result = await query(`
      SELECT
        CASE
          WHEN response_time_ms < 60000 THEN 'under_1min'
          WHEN response_time_ms < 300000 THEN '1_to_5min'
          WHEN response_time_ms < 900000 THEN '5_to_15min'
          WHEN response_time_ms < 3600000 THEN '15min_to_1hr'
          ELSE 'over_1hr'
        END as bucket,
        COUNT(*) as count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.sender_type = 'agent'
        AND m.response_time_ms IS NOT NULL
        ${accountFilter}
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN 'under_1min' THEN 1
          WHEN '1_to_5min' THEN 2
          WHEN '5_to_15min' THEN 3
          WHEN '15min_to_1hr' THEN 4
          ELSE 5
        END
    `, params);

    res.json({ distribution: result });
  } catch (error) {
    console.error('Analytics response-times error:', error);
    res.status(500).json({ error: 'Failed to get response time distribution' });
  }
});

// Get hourly activity heatmap
router.get('/hourly-activity', async (req: Request, res: Response) => {
  try {
    const { accountId, days = 7 } = req.query;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let accountFilter = '';
    const params: any[] = [parseInt(days as string)];
    let paramIndex = 2;

    if (accountId) {
      params.push(accountId);
      accountFilter = `AND wa.id = $${paramIndex++}`;
    } else if (!isAdmin) {
      params.push(userId);
      accountFilter = `AND wa.user_id = $${paramIndex++}`;
    }

    const result = await query(`
      SELECT
        EXTRACT(DOW FROM m.created_at) as day_of_week,
        EXTRACT(HOUR FROM m.created_at) as hour,
        COUNT(*) as message_count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.created_at >= NOW() - INTERVAL '1 day' * $1 ${accountFilter}
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour
    `, params);

    res.json({ heatmap: result });
  } catch (error) {
    console.error('Analytics hourly-activity error:', error);
    res.status(500).json({ error: 'Failed to get hourly activity' });
  }
});

export default router;
