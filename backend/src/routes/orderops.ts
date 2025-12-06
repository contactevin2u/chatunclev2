import { Router, Request, Response } from 'express';
import { queryOne, query } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

// OrderOps API configuration
const ORDEROPS_API_URL = process.env.ORDEROPS_API_URL || 'https://orderops-api-v1.onrender.com';
const ORDEROPS_USERNAME = process.env.ORDEROPS_USERNAME || '';
const ORDEROPS_PASSWORD = process.env.ORDEROPS_PASSWORD || '';

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get a valid OrderOps token, logging in if needed
 */
async function getOrderOpsToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!ORDEROPS_USERNAME || !ORDEROPS_PASSWORD) {
    throw new Error('OrderOps credentials not configured. Set ORDEROPS_USERNAME and ORDEROPS_PASSWORD env variables.');
  }

  console.log('[OrderOps] Logging in to get fresh token...');

  const response = await fetch(`${ORDEROPS_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ORDEROPS_USERNAME,
      password: ORDEROPS_PASSWORD,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OrderOps] Login failed:', response.status, errorText);
    throw new Error(`OrderOps login failed: ${errorText}`);
  }

  // OrderOps returns the token in Set-Cookie header, not in JSON body
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    // Parse token from "token=xxx; ..." format
    const tokenMatch = setCookie.match(/token=([^;]+)/);
    if (tokenMatch) {
      cachedToken = tokenMatch[1];
    }
  }

  if (!cachedToken) {
    throw new Error('OrderOps login succeeded but no token returned');
  }

  // Default to 1 hour expiry
  tokenExpiry = Date.now() + 3600 * 1000;

  console.log('[OrderOps] Login successful, token cached');
  return cachedToken;
}

router.use(authenticate);

/**
 * Send a message to OrderOps for parsing
 * POST /api/orderops/parse
 *
 * Uses the /parse/advanced endpoint which is a 4-stage LLM parsing pipeline
 * for complex WhatsApp messages (deliveries, returns, buybacks, etc.)
 */
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { messageId, conversationId } = req.body;

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

    if (!message.content) {
      res.status(400).json({ error: 'Message has no text content' });
      return;
    }

    // Get auth token (will login if needed)
    let token: string;
    try {
      token = await getOrderOpsToken();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Call OrderOps API - /parse/advanced with JSON body
    const response = await fetch(`${ORDEROPS_API_URL}/parse/advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: message.content,
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
    const data = result.data || result;

    console.log('[OrderOps] Parse result:', JSON.stringify(data).substring(0, 300));

    // Store order reference if parsing was successful
    if (data.status === 'success' && (data.order_id || data.mother_order_id)) {
      const orderId = data.order_id || data.mother_order_id;
      const orderCode = data.order_code || data.mother_order_code;

      // Get contact_id from conversation
      const conv = await queryOne(`
        SELECT contact_id FROM conversations WHERE id = $1
      `, [conversationId]);

      if (conv) {
        await query(`
          INSERT INTO contact_orders (
            contact_id, conversation_id, message_id,
            orderops_order_id, order_code, order_type,
            customer_name, status, parsed_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (orderops_order_id) DO UPDATE SET
            order_code = EXCLUDED.order_code,
            status = EXCLUDED.status,
            parsed_data = EXCLUDED.parsed_data,
            updated_at = NOW()
        `, [
          conv.contact_id,
          conversationId,
          messageId,
          orderId,
          orderCode,
          data.type || 'delivery',
          data.parsed_data?.customer_name || null,
          data.status,
          JSON.stringify(data)
        ]);

        console.log('[OrderOps] Order stored:', orderCode);
      }
    }

    res.json({
      success: data.status === 'success',
      result: data,
      message: data.message || 'Message sent to OrderOps for parsing',
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

    // Get auth token (will login if needed)
    let token: string;
    try {
      token = await getOrderOpsToken();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
      return;
    }

    const response = await fetch(`${ORDEROPS_API_URL}/parse/quotation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: message.content,
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

/**
 * Get orders for a contact
 * GET /api/orderops/contact/:contactId/orders
 */
router.get('/contact/:contactId/orders', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const orders = await query(`
      SELECT * FROM contact_orders
      WHERE contact_id = $1
      ORDER BY created_at DESC
    `, [contactId]);

    res.json({ success: true, orders: orders.rows });
  } catch (error: any) {
    console.error('[OrderOps] Fetch orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get order details from OrderOps
 * GET /api/orderops/order/:orderId
 */
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Get auth token
    let token: string;
    try {
      token = await getOrderOpsToken();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Fetch from OrderOps
    const response = await fetch(`${ORDEROPS_API_URL}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await response.json();
    res.json({ success: true, order: result.data || result });
  } catch (error: any) {
    console.error('[OrderOps] Fetch order error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
