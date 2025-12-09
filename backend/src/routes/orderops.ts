import { Router, Request, Response } from 'express';
import { queryOne, query, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { getIO } from '../services/socket';

const router = Router();

// OrderOps API configuration
const ORDEROPS_API_URL = process.env.ORDEROPS_API_URL || 'https://orderops-api-v1.onrender.com';
const ORDEROPS_USERNAME = process.env.ORDEROPS_USERNAME || '';
const ORDEROPS_PASSWORD = process.env.ORDEROPS_PASSWORD || '';

// Token cache with lock to prevent race conditions
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let tokenRefreshPromise: Promise<string> | null = null;

/**
 * Get a valid OrderOps token, logging in if needed
 * Uses a lock to prevent multiple concurrent login requests
 */
async function getOrderOpsToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  // If a refresh is already in progress, wait for it
  if (tokenRefreshPromise) {
    console.log('[OrderOps] Waiting for existing token refresh...');
    return tokenRefreshPromise;
  }

  // Start a new token refresh with lock
  tokenRefreshPromise = refreshToken();

  try {
    const token = await tokenRefreshPromise;
    return token;
  } finally {
    tokenRefreshPromise = null;
  }
}

/**
 * Actually perform the token refresh (called only once per refresh cycle)
 */
async function refreshToken(): Promise<string> {
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
 * Send a message to OrderOps for parsing (async - returns immediately)
 * POST /api/orderops/parse
 *
 * Uses the /parse/advanced endpoint which is a 4-stage LLM parsing pipeline
 * for complex WhatsApp messages (deliveries, returns, buybacks, etc.)
 *
 * Returns immediately and processes in background.
 * Emits 'orderops:result' socket event when complete.
 */
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { messageId, conversationId } = req.body;
    const userId = req.user!.userId;

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

    // Return immediately - processing happens in background
    res.json({
      success: true,
      processing: true,
      messageId,
      message: 'Order is being processed. You will be notified when complete.',
    });

    // Process in background (not awaited)
    processOrderAsync(userId, messageId, conversationId, message.content).catch(err => {
      console.error('[OrderOps] Background processing error:', err);
    });

  } catch (error: any) {
    console.error('[OrderOps] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Background processor for OrderOps parsing
 */
async function processOrderAsync(
  userId: string,
  messageId: string,
  conversationId: string,
  messageContent: string
): Promise<void> {
  const io = getIO();
  const startTime = Date.now();

  try {
    console.log(`[OrderOps] Starting async parse for message ${messageId}`);

    // Call OrderOps API with auto-retry on 401
    const fetchRes = await orderOpsRequest('/parse/advanced', {
      method: 'POST',
      body: JSON.stringify({ message: messageContent }),
    });

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      console.error('[OrderOps] API error:', fetchRes.status, errorText);

      // Notify failure
      io.to(`user:${userId}`).emit('orderops:result', {
        success: false,
        messageId,
        conversationId,
        error: `OrderOps API error: ${fetchRes.status}`,
        duration: Date.now() - startTime,
      });
      return;
    }

    const result = await fetchRes.json() as any;
    const data = result.data || result;

    console.log('[OrderOps] Parse result:', JSON.stringify(data).substring(0, 300));

    // Store order reference if parsing was successful
    let orderCode = null;
    if (data.status === 'success' && (data.order_id || data.mother_order_id)) {
      const orderId = data.order_id || data.mother_order_id;
      orderCode = data.order_code || data.mother_order_code;

      // Extract nested fields from parsed data
      const parsedOrder = data.parsed_data?.order;
      const parsedCustomer = data.parsed_data?.customer;
      const customerName = parsedCustomer?.name || null;
      const orderTotal = parsedOrder?.totals?.total || parsedOrder?.total || null;
      const orderBalance = parsedOrder?.totals?.to_collect || parsedOrder?.balance || null;
      const orderType = parsedOrder?.type || data.type || 'DELIVERY';
      const deliveryDate = parsedOrder?.delivery_date || null;

      // Get contact_id from conversation
      const conv = await queryOne(`
        SELECT contact_id FROM conversations WHERE id = $1
      `, [conversationId]);

      if (conv) {
        await query(`
          INSERT INTO contact_orders (
            contact_id, conversation_id, message_id,
            orderops_order_id, order_code, order_type,
            customer_name, total, balance, status, parsed_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (orderops_order_id) DO UPDATE SET
            conversation_id = EXCLUDED.conversation_id,
            message_id = EXCLUDED.message_id,
            order_code = EXCLUDED.order_code,
            customer_name = EXCLUDED.customer_name,
            total = EXCLUDED.total,
            balance = EXCLUDED.balance,
            status = EXCLUDED.status,
            parsed_data = EXCLUDED.parsed_data,
            updated_at = NOW()
        `, [
          conv.contact_id,
          conversationId,
          messageId,
          orderId,
          orderCode,
          orderType,
          customerName,
          orderTotal,
          orderBalance,
          data.status,
          JSON.stringify(data)
        ]);

        console.log('[OrderOps] Order stored:', orderCode, '| Customer:', customerName, '| Total:', orderTotal);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[OrderOps] Async parse completed in ${duration}ms`);

    // Notify success
    io.to(`user:${userId}`).emit('orderops:result', {
      success: data.status === 'success',
      messageId,
      conversationId,
      orderCode,
      result: data,
      duration,
    });

  } catch (error: any) {
    console.error('[OrderOps] Async processing error:', error);

    // Notify failure
    io.to(`user:${userId}`).emit('orderops:result', {
      success: false,
      messageId,
      conversationId,
      error: error.message,
      duration: Date.now() - startTime,
    });
  }
}

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

/**
 * Get orders linked to a conversation
 * GET /api/orderops/conversation/:conversationId/orders
 */
router.get('/conversation/:conversationId/orders', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership (including shared account access)
    const conversation = await queryOne(`
      SELECT c.id, c.contact_id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get linked orders
    const rawOrders = await query(`
      SELECT co.*,
        (SELECT json_agg(child.*) FROM contact_orders child WHERE child.mother_order_id = co.orderops_order_id) as child_orders
      FROM contact_orders co
      WHERE co.conversation_id = $1
      ORDER BY co.created_at DESC
    `, [conversationId]);

    // Extract missing fields from parsed_data for backwards compatibility
    const orders = rawOrders.map((order: any) => {
      const parsedData = typeof order.parsed_data === 'string'
        ? JSON.parse(order.parsed_data)
        : order.parsed_data;

      // Extract from nested parsed_data structure (OrderOps format)
      const innerData = parsedData?.parsed_data;
      const customer = innerData?.customer || {};
      const orderDetails = innerData?.order || {};
      const totals = orderDetails?.totals || {};

      return {
        ...order,
        // Fill in nulls from parsed_data
        customer_name: order.customer_name || customer.name || null,
        total: order.total || totals.total || orderDetails.total || null,
        balance: order.balance || totals.to_collect || orderDetails.balance || null,
        // Also extract useful fields that aren't in top-level
        customer_phone: customer.phone || null,
        customer_address: customer.address || null,
        delivery_date: orderDetails.delivery_date || null,
        items: orderDetails.items || [],
      };
    });

    res.json({ success: true, orders });
  } catch (error: any) {
    console.error('[OrderOps] Get conversation orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Link an order to a conversation (by order ID or code)
 * POST /api/orderops/conversation/:conversationId/link
 * Body: { orderId?: number, orderCode?: string }
 */
router.post('/conversation/:conversationId/link', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { orderId, orderCode } = req.body;
    const userId = req.user!.userId;

    if (!orderId && !orderCode) {
      res.status(400).json({ error: 'orderId or orderCode is required' });
      return;
    }

    // Verify ownership (including shared account access) and get contact
    const conversation = await queryOne(`
      SELECT c.id, c.contact_id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Fetch order from OrderOps
    let order: any = null;

    if (orderId) {
      // Direct fetch by ID
      const fetchRes = await orderOpsRequest(`/orders/${orderId}`, { method: 'GET' });
      if (!fetchRes.ok) {
        const errorText = await fetchRes.text();
        console.log(`[OrderOps] Order ${orderId} fetch failed:`, fetchRes.status, errorText);
        res.status(404).json({ error: `Order ID ${orderId} not found in OrderOps` });
        return;
      }
      const result = await fetchRes.json() as any;
      order = result.data || result;
    } else {
      // Search by code - try multiple approaches
      console.log(`[OrderOps] Searching for order code: ${orderCode}`);

      // Try search endpoint first
      let fetchRes = await orderOpsRequest(`/orders/search?q=${orderCode}`, { method: 'GET' });

      if (!fetchRes.ok) {
        // Fallback to filter by code parameter
        fetchRes = await orderOpsRequest(`/orders?code=${orderCode}&limit=10`, { method: 'GET' });
      }

      if (!fetchRes.ok) {
        const errorText = await fetchRes.text();
        console.log(`[OrderOps] Order code search failed:`, fetchRes.status, errorText);
        res.status(404).json({ error: `Order code ${orderCode} not found in OrderOps` });
        return;
      }

      const result = await fetchRes.json() as any;
      console.log(`[OrderOps] Search result:`, JSON.stringify(result).substring(0, 500));

      // Handle different response structures
      let orders: any[] = [];
      if (Array.isArray(result)) {
        orders = result;
      } else if (Array.isArray(result.data?.items)) {
        // {ok: true, data: {items: [...]}}
        orders = result.data.items;
      } else if (Array.isArray(result.data)) {
        orders = result.data;
      } else if (Array.isArray(result.orders)) {
        orders = result.orders;
      } else if (Array.isArray(result.items)) {
        orders = result.items;
      } else if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        // Single order returned as data object
        orders = [result.data];
      } else if (result.id && result.code) {
        // Single order returned directly
        orders = [result];
      }

      console.log(`[OrderOps] Parsed ${orders.length} orders from response`);

      // Find exact match by code (case insensitive)
      const codeUpper = orderCode.toUpperCase();
      order = orders.find((o: any) => o.code?.toUpperCase() === codeUpper) || orders[0] || null;

      if (!order) {
        console.log(`[OrderOps] No order found matching code ${orderCode}`);
        res.status(404).json({ error: `Order code ${orderCode} not found` });
        return;
      }
    }

    // Normalize order ID field (could be 'id', 'order_id', or 'orderId')
    const orderId_normalized = order.id || order.order_id || order.orderId;
    const orderCode_normalized = order.code || order.order_code || order.orderCode;

    console.log(`[OrderOps] Found order:`, orderId_normalized, orderCode_normalized, 'keys:', Object.keys(order).join(','));

    if (!orderId_normalized) {
      console.error(`[OrderOps] Order has no ID field:`, JSON.stringify(order).substring(0, 300));
      res.status(500).json({ error: 'Order data missing ID field' });
      return;
    }

    // Fetch due info
    const dueRes = await orderOpsRequest(`/orders/${orderId_normalized}/due`, { method: 'GET' });
    let due: any = null;
    if (dueRes.ok) {
      due = await dueRes.json();
      due = due.data || due;
    }

    // Check if already linked
    const existing = await queryOne(`
      SELECT id FROM contact_orders WHERE orderops_order_id = $1
    `, [orderId_normalized]);

    // Normalize other fields
    const motherOrderId = order.mother_order_id || order.motherOrderId || null;
    const orderType = order.type || order.order_type || 'DELIVERY';
    const customerName = order.customer?.name || order.customer_name || null;
    const orderTotal = order.total || order.subtotal || '0';
    const orderBalance = due?.balance || order.balance || '0';
    const orderStatus = order.status || 'NEW';
    const deliveryStatus = order.trip?.status || order.delivery_status || null;

    if (existing) {
      // Update existing link
      await execute(`
        UPDATE contact_orders SET
          conversation_id = $1,
          contact_id = $2,
          order_code = $3,
          order_type = $4,
          customer_name = $5,
          total = $6,
          balance = $7,
          status = $8,
          delivery_status = $9,
          parsed_data = $10,
          updated_at = NOW()
        WHERE orderops_order_id = $11
      `, [
        conversationId,
        conversation.contact_id,
        orderCode_normalized,
        orderType,
        customerName,
        orderTotal,
        orderBalance,
        orderStatus,
        deliveryStatus,
        JSON.stringify({ order, due }),
        orderId_normalized
      ]);
    } else {
      // Create new link
      await execute(`
        INSERT INTO contact_orders (
          contact_id, conversation_id, orderops_order_id, mother_order_id,
          order_code, order_type, customer_name, total, balance, status, delivery_status, parsed_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        conversation.contact_id,
        conversationId,
        orderId_normalized,
        motherOrderId,
        orderCode_normalized,
        orderType,
        customerName,
        orderTotal,
        orderBalance,
        orderStatus,
        deliveryStatus,
        JSON.stringify({ order, due })
      ]);
    }

    res.json({
      success: true,
      message: existing ? 'Order link updated' : 'Order linked',
      order,
      due
    });
  } catch (error: any) {
    console.error('[OrderOps] Link order error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Unlink an order from a conversation
 * DELETE /api/orderops/conversation/:conversationId/orders/:orderId
 */
router.delete('/conversation/:conversationId/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { conversationId, orderId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership (including shared account access)
    const conversation = await queryOne(`
      SELECT c.id FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await execute(`
      DELETE FROM contact_orders
      WHERE conversation_id = $1 AND orderops_order_id = $2
    `, [conversationId, orderId]);

    res.json({ success: true, message: 'Order unlinked' });
  } catch (error: any) {
    console.error('[OrderOps] Unlink order error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync/refresh order data from OrderOps
 * POST /api/orderops/conversation/:conversationId/orders/:orderId/sync
 */
router.post('/conversation/:conversationId/orders/:orderId/sync', async (req: Request, res: Response) => {
  try {
    const { conversationId, orderId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership (including shared account access)
    const conversation = await queryOne(`
      SELECT c.id, c.contact_id FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      LEFT JOIN account_access aa ON wa.id = aa.whatsapp_account_id AND aa.agent_id = $2
      WHERE c.id = $1 AND (wa.user_id = $2 OR aa.agent_id IS NOT NULL)
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Fetch fresh data from OrderOps
    const orderRes = await orderOpsRequest(`/orders/${orderId}`, { method: 'GET' });
    if (!orderRes.ok) {
      res.status(404).json({ error: 'Order not found in OrderOps' });
      return;
    }

    const orderResult = await orderRes.json() as any;
    const order = orderResult.data || orderResult;

    // Fetch due info
    const dueRes = await orderOpsRequest(`/orders/${orderId}/due`, { method: 'GET' });
    let due: any = null;
    if (dueRes.ok) {
      due = await dueRes.json();
      due = due.data || due;
    }

    // Fetch driver info if driver_id exists but driver_name is null
    if (order.trip?.driver_id && !order.trip?.driver_name) {
      try {
        const driverRes = await orderOpsRequest(`/drivers/${order.trip.driver_id}`, { method: 'GET' });
        if (driverRes.ok) {
          const driverData = await driverRes.json();
          const driver = driverData.data || driverData;
          order.trip.driver_name = driver.name;
          order.trip.driver = driver;
          console.log(`[OrderOps] Fetched driver ${order.trip.driver_id}: ${driver.name}`);
        }
      } catch (err) {
        console.error('[OrderOps] Failed to fetch driver info:', err);
      }
    }

    // Update local record
    await execute(`
      UPDATE contact_orders SET
        order_code = $1,
        order_type = $2,
        customer_name = $3,
        total = $4,
        balance = $5,
        status = $6,
        delivery_status = $7,
        parsed_data = $8,
        updated_at = NOW()
      WHERE conversation_id = $9 AND orderops_order_id = $10
    `, [
      order.code,
      order.type,
      order.customer?.name,
      order.total,
      due?.balance || order.balance,
      order.status,
      order.trip?.status,
      JSON.stringify({ order, due }),
      conversationId,
      orderId
    ]);

    res.json({ success: true, order, due });
  } catch (error: any) {
    console.error('[OrderOps] Sync order error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
