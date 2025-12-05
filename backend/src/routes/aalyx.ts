import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AalyxOrder } from '../types';

const router = Router();

router.use(authenticate);

const AALYX_API_BASE = 'https://orderops-api-v1.onrender.com';

// Helper function to call Aalyx API
async function callAalyxApi(endpoint: string, method: string = 'GET', body?: any) {
  const response = await fetch(`${AALYX_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Aalyx API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Get orders for a conversation
router.get('/orders/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    // Verify ownership
    const conversation = await queryOne(`
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const orders = await query<AalyxOrder>(`
      SELECT * FROM aalyx_orders
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `, [conversationId]);

    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Get all pending/unpaid orders
router.get('/orders/outstanding', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const orders = await query(`
      SELECT ao.*, ct.name as contact_name, ct.phone_number as contact_phone
      FROM aalyx_orders ao
      JOIN conversations c ON ao.conversation_id = c.id
      JOIN contacts ct ON ao.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE wa.user_id = $1
        AND ao.payment_status IN ('unpaid', 'partial')
        AND ao.status NOT IN ('cancelled', 'completed')
      ORDER BY ao.payment_due_date ASC NULLS LAST
    `, [userId]);

    res.json({ orders });
  } catch (error) {
    console.error('Get outstanding orders error:', error);
    res.status(500).json({ error: 'Failed to get outstanding orders' });
  }
});

// Create/link order from Aalyx
router.post('/orders/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { aalyxOrderId, orderReference, totalAmount, currency = 'MYR', paymentDueDate, orderData } = req.body;
    const userId = req.user!.userId;

    // Verify ownership and get contact
    const conversation = await queryOne(`
      SELECT c.id, c.contact_id
      FROM conversations c
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, userId]);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // If aalyxOrderId provided, try to fetch from Aalyx API
    let orderDetails = orderData;
    if (aalyxOrderId && !orderData) {
      try {
        orderDetails = await callAalyxApi(`/orders/${aalyxOrderId}`);
      } catch (error) {
        console.error('Failed to fetch order from Aalyx:', error);
        // Continue without Aalyx data
      }
    }

    const order = await queryOne<AalyxOrder>(`
      INSERT INTO aalyx_orders (
        conversation_id, contact_id, aalyx_order_id, order_reference,
        total_amount, currency, payment_due_date, order_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      conversationId,
      conversation.contact_id,
      aalyxOrderId,
      orderReference,
      totalAmount,
      currency,
      paymentDueDate ? new Date(paymentDueDate) : null,
      orderDetails,
    ]);

    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status
router.patch('/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, paymentDueDate } = req.body;
    const userId = req.user!.userId;

    // Verify ownership
    const existing = await queryOne(`
      SELECT ao.id
      FROM aalyx_orders ao
      JOIN conversations c ON ao.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE ao.id = $1 AND wa.user_id = $2
    `, [id, userId]);

    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let paramIndex = 2;

    if (status) {
      params.push(status);
      updates.push(`status = $${paramIndex++}`);
    }

    if (paymentStatus) {
      params.push(paymentStatus);
      updates.push(`payment_status = $${paramIndex++}`);
    }

    if (paymentDueDate) {
      params.push(new Date(paymentDueDate));
      updates.push(`payment_due_date = $${paramIndex++}`);
    }

    const order = await queryOne<AalyxOrder>(`
      UPDATE aalyx_orders
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    res.json({ order });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Mark order as paid
router.post('/orders/:id/mark-paid', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const order = await queryOne<AalyxOrder>(`
      UPDATE aalyx_orders
      SET payment_status = 'paid', status = 'completed', updated_at = NOW()
      WHERE id = $1
        AND EXISTS (
          SELECT 1 FROM conversations c
          JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
          WHERE c.id = aalyx_orders.conversation_id AND wa.user_id = $2
        )
      RETURNING *
    `, [id, userId]);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json({ order });
  } catch (error) {
    console.error('Mark order paid error:', error);
    res.status(500).json({ error: 'Failed to mark order as paid' });
  }
});

// Send payment reminder
router.post('/orders/:id/remind', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Get order with conversation details
    const order = await queryOne<AalyxOrder & { wa_id: string; contact_name: string; whatsapp_account_id: string }>(`
      SELECT ao.*, ct.wa_id, ct.name as contact_name, c.whatsapp_account_id
      FROM aalyx_orders ao
      JOIN conversations c ON ao.conversation_id = c.id
      JOIN contacts ct ON ao.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE ao.id = $1 AND wa.user_id = $2
    `, [id, userId]);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    // Update reminder count and timestamp
    await execute(`
      UPDATE aalyx_orders
      SET last_reminder_sent = NOW(), reminder_count = reminder_count + 1, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    // Return order info for frontend to send message
    res.json({
      order_id: order.id,
      order_reference: order.order_reference,
      total_amount: order.total_amount,
      currency: order.currency,
      contact_name: order.contact_name,
      contact_wa_id: order.wa_id,
      conversation_id: order.conversation_id,
      whatsapp_account_id: order.whatsapp_account_id,
      reminder_count: order.reminder_count + 1,
      suggested_message: `Hi ${order.contact_name || 'there'}! This is a friendly reminder about your pending payment of ${order.currency} ${order.total_amount} for order ${order.order_reference || order.aalyx_order_id}. Please let us know if you have any questions!`,
    });
  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Sync order from Aalyx
router.post('/orders/:id/sync', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const order = await queryOne<AalyxOrder>(`
      SELECT ao.*
      FROM aalyx_orders ao
      JOIN conversations c ON ao.conversation_id = c.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE ao.id = $1 AND wa.user_id = $2
    `, [id, userId]);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!order.aalyx_order_id) {
      res.status(400).json({ error: 'Order is not linked to Aalyx' });
      return;
    }

    // Fetch latest from Aalyx
    const aalyxOrder = await callAalyxApi(`/orders/${order.aalyx_order_id}`);

    // Update local order with Aalyx data
    const updatedOrder = await queryOne<AalyxOrder>(`
      UPDATE aalyx_orders
      SET order_data = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [aalyxOrder, id]);

    res.json({ order: updatedOrder, aalyx_data: aalyxOrder });
  } catch (error) {
    console.error('Sync order error:', error);
    res.status(500).json({ error: 'Failed to sync order from Aalyx' });
  }
});

// Search Aalyx orders
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    // Search in Aalyx API
    const results = await callAalyxApi(`/orders/search?q=${encodeURIComponent(q as string)}`);

    res.json({ results });
  } catch (error) {
    console.error('Search Aalyx orders error:', error);
    res.status(500).json({ error: 'Failed to search Aalyx orders' });
  }
});

export default router;
