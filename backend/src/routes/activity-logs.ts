import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AgentActivityLog } from '../types';

const router = Router();

router.use(authenticate);

// Get activity logs (admin only for all, agent for own)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';
    const { agentId, actionType, entityType, startDate, endDate, limit = 100, offset = 0 } = req.query;

    let filter = isAdmin ? '1=1' : 'al.agent_id = $1';
    const params: any[] = isAdmin ? [] : [userId];
    let paramIndex = isAdmin ? 1 : 2;

    if (isAdmin && agentId) {
      params.push(agentId);
      filter += ` AND al.agent_id = $${paramIndex++}`;
    }

    if (actionType) {
      params.push(actionType);
      filter += ` AND al.action_type = $${paramIndex++}`;
    }

    if (entityType) {
      params.push(entityType);
      filter += ` AND al.entity_type = $${paramIndex++}`;
    }

    if (startDate) {
      params.push(startDate);
      filter += ` AND al.created_at >= $${paramIndex++}`;
    }

    if (endDate) {
      params.push(endDate);
      filter += ` AND al.created_at <= $${paramIndex++}`;
    }

    params.push(Math.min(parseInt(limit as string), 500));
    params.push(parseInt(offset as string) || 0);

    const logs = await query<AgentActivityLog & { agent_name: string; agent_email: string }>(`
      SELECT al.*, u.name as agent_name, u.email as agent_email
      FROM agent_activity_logs al
      LEFT JOIN users u ON al.agent_id = u.id
      WHERE ${filter}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, params);

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM agent_activity_logs al
      WHERE ${filter}
    `, params.slice(0, -2));

    res.json({
      logs,
      total: parseInt(countResult?.total || '0'),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Failed to get activity logs' });
  }
});

// Get activity logs for a specific agent (admin only)
router.get('/agent/:agentId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { limit = 50 } = req.query;

    const logs = await query<AgentActivityLog>(`
      SELECT al.*, u.name as agent_name
      FROM agent_activity_logs al
      LEFT JOIN users u ON al.agent_id = u.id
      WHERE al.agent_id = $1
      ORDER BY al.created_at DESC
      LIMIT $2
    `, [agentId, Math.min(parseInt(limit as string), 200)]);

    res.json({ logs });
  } catch (error) {
    console.error('Get agent activity logs error:', error);
    res.status(500).json({ error: 'Failed to get agent activity logs' });
  }
});

// Get action type summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';
    const { startDate, endDate } = req.query;

    let filter = isAdmin ? '1=1' : 'agent_id = $1';
    const params: any[] = isAdmin ? [] : [userId];
    let paramIndex = isAdmin ? 1 : 2;

    if (startDate) {
      params.push(startDate);
      filter += ` AND created_at >= $${paramIndex++}`;
    }

    if (endDate) {
      params.push(endDate);
      filter += ` AND created_at <= $${paramIndex++}`;
    }

    const summary = await query(`
      SELECT action_type, COUNT(*) as count
      FROM agent_activity_logs
      WHERE ${filter}
      GROUP BY action_type
      ORDER BY count DESC
    `, params);

    res.json({ summary });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ error: 'Failed to get activity summary' });
  }
});

// Get activity timeline for a specific entity
router.get('/entity/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    let filter = 'al.entity_type = $1 AND al.entity_id = $2';
    const params: any[] = [entityType, entityId];

    if (!isAdmin) {
      params.push(userId);
      filter += ` AND al.agent_id = $3`;
    }

    const logs = await query<AgentActivityLog & { agent_name: string }>(`
      SELECT al.*, u.name as agent_name
      FROM agent_activity_logs al
      LEFT JOIN users u ON al.agent_id = u.id
      WHERE ${filter}
      ORDER BY al.created_at DESC
      LIMIT 50
    `, params);

    res.json({ logs });
  } catch (error) {
    console.error('Get entity activity logs error:', error);
    res.status(500).json({ error: 'Failed to get entity activity logs' });
  }
});

export default router;
