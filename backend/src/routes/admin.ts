import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { User } from '../types';
import { validatePassword, validateEmail, validateName } from '../utils/validation';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

// List all agents
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = await query<User>(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.created_at,
        COUNT(DISTINCT a.id) as account_count,
        COUNT(DISTINCT c.id) as conversation_count,
        COUNT(DISTINCT aa.account_id) as shared_account_count
      FROM users u
      LEFT JOIN accounts a ON u.id = a.user_id
      LEFT JOIN conversations c ON a.id = c.whatsapp_account_id
      LEFT JOIN account_access aa ON u.id = aa.agent_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to retrieve agents' });
  }
});

// Get shared accounts for a specific agent
router.get('/agents/:id/shared-accounts', async (req: Request, res: Response) => {
  try {
    const sharedAccounts = await query(`
      SELECT
        aa.id as access_id,
        aa.permission,
        aa.granted_at,
        a.id as account_id,
        a.name as account_name,
        a.phone_number,
        a.status,
        owner.name as owner_name,
        owner.email as owner_email
      FROM account_access aa
      JOIN accounts a ON aa.account_id = a.id
      JOIN users owner ON a.user_id = owner.id
      WHERE aa.agent_id = $1
      ORDER BY aa.granted_at DESC
    `, [req.params.id]);

    res.json({ sharedAccounts });
  } catch (error) {
    console.error('Get shared accounts error:', error);
    res.status(500).json({ error: 'Failed to get shared accounts' });
  }
});

// Create new agent
router.post('/agents', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role = 'agent' } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error });
      return;
    }

    // Validate password complexity
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    // Validate name
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      res.status(400).json({ error: nameValidation.error });
      return;
    }

    // Validate role
    if (role !== 'agent' && role !== 'admin') {
      res.status(400).json({ error: 'Invalid role. Must be "agent" or "admin"' });
      return;
    }

    const existingUser = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), passwordHash, name, role]
    );

    res.status(201).json({ agent: user });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update agent
router.patch('/agents/:id', async (req: Request, res: Response) => {
  try {
    const { name, role, password } = req.body;

    const existing = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [req.params.id]
    );

    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Validate name if provided
    if (name) {
      const nameValidation = validateName(name);
      if (!nameValidation.valid) {
        res.status(400).json({ error: nameValidation.error });
        return;
      }
    }

    // Validate role if provided
    if (role && role !== 'agent' && role !== 'admin') {
      res.status(400).json({ error: 'Invalid role. Must be "agent" or "admin"' });
      return;
    }

    let passwordHash = existing.password_hash;
    if (password) {
      // Validate password complexity
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        res.status(400).json({ error: passwordValidation.error });
        return;
      }
      passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await queryOne<User>(
      `UPDATE users
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           password_hash = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, role, created_at, updated_at`,
      [name, role, passwordHash, req.params.id]
    );

    res.json({ agent: user });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent
router.delete('/agents/:id', async (req: Request, res: Response) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete yourself' });
      return;
    }

    const rowsDeleted = await execute(
      'DELETE FROM users WHERE id = $1',
      [req.params.id]
    );

    if (rowsDeleted === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({ message: 'Agent deleted' });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// View all conversations (admin)
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { agentId, limit = 50 } = req.query;

    let sql = `
      SELECT
        c.id,
        c.last_message_at,
        c.unread_count,
        ct.name as contact_name,
        ct.phone_number as contact_phone,
        a.name as account_name,
        u.name as agent_name,
        u.email as agent_email,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN accounts a ON c.whatsapp_account_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (agentId) {
      params.push(agentId);
      sql += ` AND u.id = $${params.length}`;
    }

    sql += ` ORDER BY c.last_message_at DESC NULLS LAST`;
    params.push(parseInt(limit as string, 10));
    sql += ` LIMIT $${params.length}`;

    const conversations = await query(sql, params);

    res.json({ conversations });
  } catch (error) {
    console.error('Admin list conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Dashboard statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [
      totalAgents,
      totalAccounts,
      totalConversations,
      totalMessages,
      messagesLast24h,
      activeAccounts,
    ] = await Promise.all([
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM accounts'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM conversations'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM messages'),
      queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'"
      ),
      queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM accounts WHERE status = 'connected'"
      ),
    ]);

    res.json({
      stats: {
        totalAgents: parseInt(totalAgents?.count || '0', 10),
        totalAccounts: parseInt(totalAccounts?.count || '0', 10),
        totalConversations: parseInt(totalConversations?.count || '0', 10),
        totalMessages: parseInt(totalMessages?.count || '0', 10),
        messagesLast24h: parseInt(messagesLast24h?.count || '0', 10),
        activeAccounts: parseInt(activeAccounts?.count || '0', 10),
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
