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

/**
 * Clear cached token (for retry on 401)
 */
function clearCachedToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Make an authenticated request to OrderOps with 401 retry
 * Returns the fetch Response (not Express Response)
 */
async function orderOpsRequest(path: string, options: RequestInit = {}): Promise<globalThis.Response> {
  let token = await getOrderOpsToken();

  const makeRequest = async (authToken: string): Promise<globalThis.Response> => {
    return fetch(`${ORDEROPS_API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...options.headers,
      },
    });
  };

  let fetchResponse = await makeRequest(token);

  // Retry once on 401 (token expired)
  if (fetchResponse.status === 401) {
    console.log('[OrderOps] Token expired, refreshing...');
    clearCachedToken();
    token = await getOrderOpsToken();
    fetchResponse = await makeRequest(token);
  }

  return fetchResponse;
}

/**
 * Public health check - tests OrderOps connection without auth
 * GET /api/orderops/health?order_id=123 (optional: fetch specific order)
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const { order_id } = req.query;

    // Check if credentials are configured
    if (!ORDEROPS_USERNAME || !ORDEROPS_PASSWORD) {
      res.json({
        success: false,
        configured: false,
        error: 'OrderOps credentials not configured',
      });
      return;
    }

    // Try to get a token
    const token = await getOrderOpsToken();

    // If order_id provided, fetch that specific order
    if (order_id) {
      const orderRes = await orderOpsRequest(`/orders/${order_id}`, { method: 'GET' });

      if (!orderRes.ok) {
        const errorText = await orderRes.text();
        res.json({
          success: false,
          error: `Order fetch failed: ${orderRes.status}`,
          details: errorText,
        });
        return;
      }

      const order = await orderRes.json() as any;

      // Also fetch due info
      const dueRes = await orderOpsRequest(`/orders/${order_id}/due`, { method: 'GET' });
      let due: any = null;
      if (dueRes.ok) {
        due = await dueRes.json();
      }

      res.json({
        success: true,
        order: order.data || order,
        due: due?.data || due,
      });
      return;
    }

    // Default: test with a simple API call
    const fetchRes = await orderOpsRequest('/orders?limit=1', { method: 'GET' });

    if (!fetchRes.ok) {
      res.json({
        success: false,
        configured: true,
        authenticated: true,
        api_error: fetchRes.status,
      });
      return;
    }

    const result = await fetchRes.json() as any;
    const orderCount = result.data?.length || result.orders?.length || (Array.isArray(result) ? result.length : 0);

    res.json({
      success: true,
      configured: true,
      authenticated: true,
      api_url: ORDEROPS_API_URL,
      orders_found: orderCount,
      message: 'OrderOps connection working!',
    });
  } catch (error: any) {
    res.json({
      success: false,
      configured: !!ORDEROPS_USERNAME && !!ORDEROPS_PASSWORD,
      error: error.message,
    });
  }
});

/**
 * Public test endpoint - parse a raw message and fetch order
 * POST /api/orderops/test-parse
 * Body: { message: "..." }
 */
router.post('/test-parse', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required in body' });
      return;
    }

    // Check credentials
    if (!ORDEROPS_USERNAME || !ORDEROPS_PASSWORD) {
      res.json({ success: false, error: 'OrderOps not configured' });
      return;
    }

    console.log('[OrderOps] Test parsing:', message);

    // Send for parsing
    const parseRes = await orderOpsRequest('/parse/advanced', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    if (!parseRes.ok) {
      const errorText = await parseRes.text();
      res.json({ success: false, error: 'Parse failed', details: errorText });
      return;
    }

    const parseResult = await parseRes.json() as any;
    const data = parseResult.data || parseResult;

    console.log('[OrderOps] Parse result:', JSON.stringify(data).substring(0, 500));

    // If order was created, fetch full details
    const orderId = data.order_id || data.mother_order_id;
    let order = null;
    let due = null;

    if (orderId) {
      // Fetch order details
      const orderRes = await orderOpsRequest(`/orders/${orderId}`, { method: 'GET' });
      if (orderRes.ok) {
        const orderData = await orderRes.json() as any;
        order = orderData.data || orderData;
      }

      // Fetch due info
      const dueRes = await orderOpsRequest(`/orders/${orderId}/due`, { method: 'GET' });
      if (dueRes.ok) {
        const dueData = await dueRes.json() as any;
        due = dueData.data || dueData;
      }
    }

    res.json({
      success: true,
      parse_result: data,
      order_id: orderId,
      order,
      due,
    });
  } catch (error: any) {
    console.error('[OrderOps] Test parse error:', error);
    res.json({ success: false, error: error.message });
  }
});

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

    if (!messageId || !conversationId) {
      res.status(400).json({ error: 'messageId and conversationId are required' });
      return;
    }

    // Get the message content with contact info
    const message = await queryOne(`
      SELECT m.*, c.name as contact_name, c.phone_number as contact_phone
      FROM messages m
      JOIN conversations conv ON m.conversation_id = conv.id
      JOIN contacts c ON conv.contact_id = c.id
      WHERE m.id = $1 AND m.conversation_id = $2
    `, [messageId, conversationId]);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (!message.content) {
      res.status(400).json({ error: 'Message has no text content' });
      return;
    }

    // Call OrderOps API with auto-retry on 401
    const fetchRes = await orderOpsRequest('/parse/advanced', {
      method: 'POST',
      body: JSON.stringify({ message: message.content }),
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      console.error('[OrderOps] API error:', fetchRes.status, errorText);
      res.status(fetchRes.status).json({
        error: 'OrderOps API error',
        details: errorText
      });
      return;
    }

    const result = await fetchRes.json() as any;
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
      SELECT m.*, c.name as contact_name, c.phone_number as contact_phone
      FROM messages m
      JOIN conversations conv ON m.conversation_id = conv.id
      JOIN contacts c ON conv.contact_id = c.id
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

    // Call OrderOps API with auto-retry on 401
    const fetchRes = await orderOpsRequest('/parse/quotation', {
      method: 'POST',
      body: JSON.stringify({ message: message.content }),
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      res.status(fetchRes.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await fetchRes.json() as any;
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
    const userId = req.user!.userId;

    // Verify the contact belongs to user's whatsapp account
    const orders = await query(`
      SELECT co.* FROM contact_orders co
      JOIN contacts c ON co.contact_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE co.contact_id = $1 AND wa.user_id = $2
      ORDER BY co.created_at DESC
    `, [contactId, userId]);

    res.json({ success: true, orders });
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

    // Validate orderId is numeric
    if (!/^\d+$/.test(orderId)) {
      res.status(400).json({ error: 'Invalid order ID' });
      return;
    }

    // Fetch from OrderOps with auto-retry on 401
    const fetchRes = await orderOpsRequest(`/orders/${orderId}`, {
      method: 'GET',
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      res.status(fetchRes.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await fetchRes.json() as any;
    res.json({ success: true, order: result.data || result });
  } catch (error: any) {
    console.error('[OrderOps] Fetch order error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get order payment due/balance info from OrderOps
 * GET /api/orderops/order/:orderId/due
 */
router.get('/order/:orderId/due', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { as_of } = req.query;

    // Validate orderId is numeric
    if (!/^\d+$/.test(orderId)) {
      res.status(400).json({ error: 'Invalid order ID' });
      return;
    }

    // Build query string
    const queryParams = as_of ? `?as_of=${as_of}` : '';

    // Fetch from OrderOps with auto-retry on 401
    const fetchRes = await orderOpsRequest(`/orders/${orderId}/due${queryParams}`, {
      method: 'GET',
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      res.status(fetchRes.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await fetchRes.json() as any;
    res.json({ success: true, due: result.data || result });
  } catch (error: any) {
    console.error('[OrderOps] Fetch order due error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List orders from OrderOps
 * GET /api/orderops/orders
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // Build query string
    const params = new URLSearchParams();
    if (status) params.set('status', status as string);
    params.set('limit', limit as string);
    params.set('offset', offset as string);

    const fetchRes = await orderOpsRequest(`/orders?${params.toString()}`, {
      method: 'GET',
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      res.status(fetchRes.status).json({ error: 'OrderOps API error', details: errorText });
      return;
    }

    const result = await fetchRes.json() as any;
    res.json({ success: true, orders: result.data || result.orders || result });
  } catch (error: any) {
    console.error('[OrderOps] List orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test OrderOps connection - verifies credentials and connectivity
 * GET /api/orderops/test
 */
router.get('/test', async (req: Request, res: Response) => {
  try {
    // Check if credentials are configured
    if (!ORDEROPS_USERNAME || !ORDEROPS_PASSWORD) {
      res.json({
        success: false,
        configured: false,
        error: 'OrderOps credentials not configured. Set ORDEROPS_USERNAME and ORDEROPS_PASSWORD env variables.',
      });
      return;
    }

    // Try to get a token (this will login if needed)
    const token = await getOrderOpsToken();

    // Test fetching orders to verify full connectivity
    const fetchRes = await orderOpsRequest('/orders?limit=1', { method: 'GET' });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      res.json({
        success: false,
        configured: true,
        authenticated: true,
        error: `API call failed: ${fetchRes.status} - ${errorText}`,
      });
      return;
    }

    const result = await fetchRes.json() as any;

    res.json({
      success: true,
      configured: true,
      authenticated: true,
      api_url: ORDEROPS_API_URL,
      sample_order: result.data?.[0] || result.orders?.[0] || result[0] || null,
      message: 'OrderOps connection successful!',
    });
  } catch (error: any) {
    console.error('[OrderOps] Test connection error:', error);
    res.json({
      success: false,
      configured: !!ORDEROPS_USERNAME && !!ORDEROPS_PASSWORD,
      error: error.message,
    });
  }
});

export default router;
