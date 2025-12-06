import { Router, Request, Response } from 'express';
import { queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

// OrderOps API configuration
const ORDEROPS_API_URL = process.env.ORDEROPS_API_URL || 'https://orderops-api-v1.onrender.com';
const ORDEROPS_API_KEY = process.env.ORDEROPS_API_KEY || '';

router.use(authenticate);

/**
 * Send a message to OrderOps for parsing
 * POST /api/orderops/parse
 */
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { messageId, conversationId } = req.body;
    const userId = req.user!.userId;

    if (!messageId) {
      res.status(400).json({ error: 'messageId is required' });
      return;
    }

    // Get the message content
    const message = await queryOne(`
      SELECT m.*, c.name as contact_name, ct.phone_number as contact_phone
      FROM messages m
      JOIN conversations conv ON m.conversation_id = conv.id
      JOIN contacts ct ON conv.contact_id = ct.id
      LEFT JOIN contacts c ON conv.contact_id = c.id
      WHERE m.id = $1
    `, [messageId]);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (!ORDEROPS_API_KEY) {
      res.status(500).json({ error: 'OrderOps API key not configured' });
      return;
    }

    // Call OrderOps API
    const response = await fetch(`${ORDEROPS_API_URL}/parse/advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORDEROPS_API_KEY}`,
      },
      body: JSON.stringify({
        message: message.content,
        customer_name: message.contact_name || '',
        customer_phone: message.contact_phone || '',
        // Add any additional context
        metadata: {
          source: 'chatuncle',
          message_id: messageId,
          conversation_id: conversationId,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OrderOps] API error:', response.status, errorText);
      res.status(response.status).json({
        error: 'OrderOps API error',
        details: errorText
      });
      return;
    }

    const result = await response.json();

    console.log('[OrderOps] Parse result:', JSON.stringify(result).substring(0, 200));

    res.json({
      success: true,
      result,
      message: 'Message sent to OrderOps for parsing',
    });
  } catch (error: any) {
    console.error('[OrderOps] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send message for quotation parsing (simpler, no order creation)
 * POST /api/orderops/quotation
 */
router.post('/quotation', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      res.status(400).json({ error: 'messageId is required' });
      return;
    }

    const message = await queryOne(`
      SELECT m.*, c.name as contact_name, ct.phone_number as contact_phone
      FROM messages m
      JOIN conversations conv ON m.conversation_id = conv.id
      JOIN contacts ct ON conv.contact_id = ct.id
      LEFT JOIN contacts c ON conv.contact_id = c.id
      WHERE m.id = $1
    `, [messageId]);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (!ORDEROPS_API_KEY) {
      res.status(500).json({ error: 'OrderOps API key not configured' });
      return;
    }

    const response = await fetch(`${ORDEROPS_API_URL}/parse/quotation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORDEROPS_API_KEY}`,
      },
      body: JSON.stringify({
        message: message.content,
        customer_name: message.contact_name || '',
        customer_phone: message.contact_phone || '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await response.json();
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('[OrderOps] Quotation error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
