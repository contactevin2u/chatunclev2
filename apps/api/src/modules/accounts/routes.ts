import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, accountAccessMiddleware, roleMiddleware } from '../../middleware/auth.js';
import {
  getUserAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  connectAccount,
  disconnectAccount,
  connectWithPairingCode,
} from './service.js';
import {
  grantAccountAccess,
  revokeAccountAccess,
  getAccountAgents,
} from './access.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const createAccountSchema = z.object({
  channelType: z.enum(['whatsapp', 'telegram', 'tiktok', 'instagram', 'messenger']),
  channelIdentifier: z.string().optional(),
  phoneNumber: z.string().optional(),
});

const updateAccountSchema = z.object({
  channelIdentifier: z.string().optional(),
  phoneNumber: z.string().optional(),
  incognitoMode: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});

const pairingCodeSchema = z.object({
  phoneNumber: z.string().min(10),
});

const grantAccessSchema = z.object({
  agentId: z.string().uuid(),
  role: z.enum(['admin', 'agent']),
});

/**
 * GET /api/accounts
 * Get all accounts for current user
 */
router.get('/', async (req, res) => {
  try {
    const accounts = await getUserAccounts(req.user!.userId);
    res.json({ accounts });
  } catch (error) {
    console.error('[Accounts] List error:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

/**
 * POST /api/accounts
 * Create a new account
 */
router.post('/', async (req, res) => {
  try {
    const data = createAccountSchema.parse(req.body);

    const account = await createAccount({
      userId: req.user!.userId,
      channelType: data.channelType,
      channelIdentifier: data.channelIdentifier,
      phoneNumber: data.phoneNumber,
    });

    res.status(201).json({ account });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Accounts] Create error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * GET /api/accounts/:accountId
 * Get a single account
 */
router.get('/:accountId', accountAccessMiddleware(), async (req, res) => {
  try {
    const account = await getAccountById(req.params.accountId);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ account });
  } catch (error) {
    console.error('[Accounts] Get error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

/**
 * PATCH /api/accounts/:accountId
 * Update an account
 */
router.patch('/:accountId', accountAccessMiddleware(), roleMiddleware(['owner', 'admin']), async (req, res) => {
  try {
    const data = updateAccountSchema.parse(req.body);

    const account = await updateAccount(req.params.accountId, data);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ account });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Accounts] Update error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

/**
 * DELETE /api/accounts/:accountId
 * Delete an account
 */
router.delete('/:accountId', accountAccessMiddleware(), roleMiddleware(['owner']), async (req, res) => {
  try {
    const success = await deleteAccount(req.params.accountId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to delete account' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[Accounts] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * POST /api/accounts/:accountId/connect
 * Connect account to channel (QR code flow)
 */
router.post('/:accountId/connect', accountAccessMiddleware(), async (req, res) => {
  try {
    const result = await connectAccount(req.params.accountId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      status: 'connecting',
      qrCode: result.qrCode,
      pairingCode: result.pairingCode,
    });
  } catch (error) {
    console.error('[Accounts] Connect error:', error);
    res.status(500).json({ error: 'Failed to connect account' });
  }
});

/**
 * POST /api/accounts/:accountId/connect/pairing-code
 * Connect account using pairing code (WhatsApp)
 */
router.post('/:accountId/connect/pairing-code', accountAccessMiddleware(), async (req, res) => {
  try {
    const data = pairingCodeSchema.parse(req.body);
    const result = await connectWithPairingCode(req.params.accountId, data.phoneNumber);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      status: 'connecting',
      pairingCode: result.pairingCode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Accounts] Pairing code error:', error);
    res.status(500).json({ error: 'Failed to get pairing code' });
  }
});

/**
 * POST /api/accounts/:accountId/disconnect
 * Disconnect account
 */
router.post('/:accountId/disconnect', accountAccessMiddleware(), async (req, res) => {
  try {
    const success = await disconnectAccount(req.params.accountId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('[Accounts] Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

/**
 * GET /api/accounts/:accountId/agents
 * Get all agents with access to account
 */
router.get('/:accountId/agents', accountAccessMiddleware(), async (req, res) => {
  try {
    const agents = await getAccountAgents(req.params.accountId);
    res.json({ agents });
  } catch (error) {
    console.error('[Accounts] Get agents error:', error);
    res.status(500).json({ error: 'Failed to get agents' });
  }
});

/**
 * POST /api/accounts/:accountId/agents
 * Grant access to an agent
 */
router.post('/:accountId/agents', accountAccessMiddleware(), roleMiddleware(['owner', 'admin']), async (req, res) => {
  try {
    const data = grantAccessSchema.parse(req.body);

    const success = await grantAccountAccess(
      req.params.accountId,
      data.agentId,
      data.role
    );

    if (!success) {
      return res.status(500).json({ error: 'Failed to grant access' });
    }

    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Accounts] Grant access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

/**
 * DELETE /api/accounts/:accountId/agents/:agentId
 * Revoke access from an agent
 */
router.delete('/:accountId/agents/:agentId', accountAccessMiddleware(), roleMiddleware(['owner', 'admin']), async (req, res) => {
  try {
    const success = await revokeAccountAccess(req.params.accountId, req.params.agentId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to revoke access' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[Accounts] Revoke access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;
