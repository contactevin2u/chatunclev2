import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { processDocument, getAISettings } from '../services/ai';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  },
});

router.use(authenticate);

// Get AI settings for an account
router.get('/settings/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.userId;

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const settings = await getAISettings(accountId);
    res.json({ settings });
  } catch (error: any) {
    console.error('Get AI settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update AI settings for an account
router.put('/settings/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { enabled, auto_reply, model, temperature, max_tokens, max_consecutive_replies, custom_prompt } = req.body;
    const userId = req.user!.userId;

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Upsert settings
    const settings = await queryOne(`
      INSERT INTO ai_settings (account_id, enabled, auto_reply, model, temperature, max_tokens, max_consecutive_replies, custom_prompt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (account_id) WHERE account_id IS NOT NULL
      DO UPDATE SET
        enabled = $2,
        auto_reply = $3,
        model = $4,
        temperature = $5,
        max_tokens = $6,
        max_consecutive_replies = $7,
        custom_prompt = $8,
        updated_at = NOW()
      RETURNING *
    `, [
      accountId,
      enabled ?? false,
      auto_reply ?? false,
      model || 'gpt-4o-mini',
      temperature ?? 0.7,
      max_tokens ?? 100,
      max_consecutive_replies ?? 2,
      custom_prompt || null,
    ]);

    res.json({ settings });
  } catch (error: any) {
    console.error('Update AI settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List knowledge documents for an account
router.get('/documents/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.userId;

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const documents = await query(`
      SELECT id, name, mime_type, content_length, created_at,
        (SELECT COUNT(*) FROM knowledge_chunks WHERE document_id = knowledge_documents.id) as chunk_count
      FROM knowledge_documents
      WHERE COALESCE(account_id, whatsapp_account_id) = $1
      ORDER BY created_at DESC
    `, [accountId]);

    res.json({ documents: documents || [] });
  } catch (error: any) {
    console.error('List documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload a knowledge document
router.post('/documents/:accountId', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.userId;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const { originalname, mimetype, buffer } = req.file;

    console.log(`[Knowledge] Processing ${originalname} (${mimetype})`);

    const result = await processDocument(accountId, originalname, buffer, mimetype);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      message: 'Document processed successfully',
      name: originalname,
      chunks: result.chunks,
    });
  } catch (error: any) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add text content directly (for FAQ, etc.)
router.post('/documents/:accountId/text', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { name, content } = req.body;
    const userId = req.user!.userId;

    if (!name || !content) {
      res.status(400).json({ error: 'Name and content are required' });
      return;
    }

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const result = await processDocument(accountId, name, content, 'text/plain');

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      message: 'Content added successfully',
      name,
      chunks: result.chunks,
    });
  } catch (error: any) {
    console.error('Add text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a knowledge document
router.delete('/documents/:accountId/:documentId', async (req: Request, res: Response) => {
  try {
    const { accountId, documentId } = req.params;
    const userId = req.user!.userId;

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Delete document (chunks will cascade delete)
    await execute(`
      DELETE FROM knowledge_documents WHERE id = $1 AND COALESCE(account_id, whatsapp_account_id) = $2
    `, [documentId, accountId]);

    res.json({ message: 'Document deleted' });
  } catch (error: any) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI logs for monitoring
router.get('/logs/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { limit = 50 } = req.query;
    const userId = req.user!.userId;

    // Verify user owns this account
    const account = await queryOne(`
      SELECT id FROM accounts WHERE id = $1 AND user_id = $2
    `, [accountId, userId]);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const logs = await query(`
      SELECT id, customer_message, ai_response, model, tokens_used, created_at
      FROM ai_logs
      WHERE COALESCE(account_id, whatsapp_account_id) = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [accountId, parseInt(limit as string)]);

    res.json({ logs: logs || [] });
  } catch (error: any) {
    console.error('Get AI logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
