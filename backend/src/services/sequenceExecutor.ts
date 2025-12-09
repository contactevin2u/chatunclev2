import { query, queryOne, execute } from '../config/database';
import { sessionManager } from './whatsapp/SessionManager';
import { getIO } from './socket';

interface SequenceItem {
  id: string;
  sequence_id: string;
  order_index: number;
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
}

interface ExecutionContext {
  conversationId: string;
  waAccountId: string;
  waId: string;
  jidType: 'lid' | 'pn';
  agentId: string;
  agentName?: string;
}

// Active sequence executions (to prevent duplicates)
const activeExecutions = new Map<string, boolean>();

// Minimum delay between sequence items (anti-ban protection)
const MIN_SEQUENCE_DELAY_MS = 500; // 0.5 seconds minimum

/**
 * Get a random delay between min and max seconds
 * Enforces minimum delay for anti-ban protection
 */
function getRandomDelay(minSeconds: number, maxSeconds: number): number {
  // Enforce minimum delay of 0.5 seconds for anti-ban
  const effectiveMin = Math.max(minSeconds, 0.5);
  const effectiveMax = Math.max(maxSeconds, effectiveMin);

  if (effectiveMin >= effectiveMax) {
    return effectiveMin * 1000;
  }
  const range = effectiveMax - effectiveMin;
  const randomSeconds = effectiveMin + Math.random() * range;
  return Math.round(randomSeconds * 1000); // Convert to milliseconds
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a single message item
 */
async function sendSequenceItem(
  item: SequenceItem,
  context: ExecutionContext
): Promise<string | null> {
  try {
    // Calculate response time (time since last contact message)
    const lastContactMessage = await queryOne(`
      SELECT created_at FROM messages
      WHERE conversation_id = $1 AND sender_type = 'contact'
      ORDER BY created_at DESC
      LIMIT 1
    `, [context.conversationId]);

    const responseTimeMs = lastContactMessage
      ? Date.now() - new Date(lastContactMessage.created_at).getTime()
      : null;

    // Save message to database with 'pending' status
    const message = await queryOne<any>(`
      INSERT INTO messages (conversation_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id, response_time_ms)
      VALUES ($1, 'agent', $2, $3, $4, $5, 'pending', $6, $7)
      RETURNING *
    `, [
      context.conversationId,
      item.content_type,
      item.content || '',
      item.media_url || null,
      item.media_mime_type || null,
      context.agentId,
      responseTimeMs
    ]);

    // Update conversation
    await execute(`
      UPDATE conversations
      SET last_message_at = NOW(),
          updated_at = NOW(),
          first_response_at = COALESCE(first_response_at, NOW()),
          assigned_agent_id = COALESCE(assigned_agent_id, $2)
      WHERE id = $1
    `, [context.conversationId, context.agentId]);

    // Emit new message to frontend immediately (optimistic UI)
    const io = getIO();
    io.to(`user:${context.agentId}`).emit('message:new', {
      conversationId: context.conversationId,
      message: {
        ...message,
        agent_name: context.agentName,
      }
    });

    // Send via WhatsApp
    const waMessageId = await sessionManager.sendMessage(
      context.waAccountId,
      context.waId,
      {
        type: item.content_type,
        content: item.content || '',
        mediaUrl: item.media_url,
        mediaMimeType: item.media_mime_type,
      },
      {
        jidType: context.jidType || 'pn',
      }
    );

    // Update message status to 'sent'
    await execute(`
      UPDATE messages SET wa_message_id = $1, status = 'sent', updated_at = NOW()
      WHERE id = $2
    `, [waMessageId, message.id]);

    // Notify frontend of successful send
    io.to(`user:${context.agentId}`).emit('message:status', {
      messageId: message.id,
      waMessageId,
      status: 'sent',
    });

    console.log(`[Sequence] Sent item ${item.order_index + 1}: ${item.content_type}`);
    return message.id;

  } catch (error: any) {
    console.error(`[Sequence] Failed to send item ${item.order_index + 1}:`, error);
    return null;
  }
}

/**
 * Execute a template sequence with random delays
 */
export async function executeSequence(
  sequenceId: string,
  conversationId: string,
  agentId: string
): Promise<{ success: boolean; messagesSent: number; error?: string }> {
  const executionKey = `${sequenceId}:${conversationId}`;

  // Prevent duplicate executions
  if (activeExecutions.has(executionKey)) {
    return { success: false, messagesSent: 0, error: 'Sequence already executing' };
  }

  activeExecutions.set(executionKey, true);

  try {
    // Get sequence and verify ownership
    const sequence = await queryOne<any>(`
      SELECT s.* FROM template_sequences s
      WHERE s.id = $1 AND s.user_id = $2 AND s.is_active = TRUE
    `, [sequenceId, agentId]);

    if (!sequence) {
      return { success: false, messagesSent: 0, error: 'Sequence not found or inactive' };
    }

    // Get sequence items in order
    const items = await query<SequenceItem>(`
      SELECT * FROM template_sequence_items
      WHERE sequence_id = $1
      ORDER BY order_index ASC
    `, [sequenceId]);

    if (items.length === 0) {
      return { success: false, messagesSent: 0, error: 'Sequence has no items' };
    }

    // Get conversation details
    const conversation = await queryOne<any>(`
      SELECT c.id, c.whatsapp_account_id, ct.wa_id, ct.jid_type
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE c.id = $1 AND wa.user_id = $2
    `, [conversationId, agentId]);

    if (!conversation) {
      return { success: false, messagesSent: 0, error: 'Conversation not found' };
    }

    // Get agent name
    const agent = await queryOne<any>('SELECT name FROM users WHERE id = $1', [agentId]);

    const context: ExecutionContext = {
      conversationId,
      waAccountId: conversation.whatsapp_account_id,
      waId: conversation.wa_id,
      jidType: conversation.jid_type || 'pn',
      agentId,
      agentName: agent?.name,
    };

    console.log(`[Sequence] Starting execution of "${sequence.name}" with ${items.length} items`);

    let messagesSent = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Apply delay before sending (except for first item)
      if (i > 0) {
        const delayMs = getRandomDelay(item.delay_min_seconds, item.delay_max_seconds);
        if (delayMs > 0) {
          console.log(`[Sequence] Waiting ${delayMs}ms before item ${i + 1}`);
          await sleep(delayMs);
        }
      }

      // Send the item
      const messageId = await sendSequenceItem(item, context);
      if (messageId) {
        messagesSent++;
      }
    }

    console.log(`[Sequence] Completed "${sequence.name}" - sent ${messagesSent}/${items.length} messages`);

    // Log activity
    await execute(`
      INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
      VALUES ($1, 'sequence_executed', 'template_sequence', $2, $3)
    `, [agentId, sequenceId, JSON.stringify({
      sequence_name: sequence.name,
      conversation_id: conversationId,
      messages_sent: messagesSent
    })]);

    return { success: true, messagesSent };

  } catch (error: any) {
    console.error('[Sequence] Execution error:', error);
    return { success: false, messagesSent: 0, error: error.message };
  } finally {
    activeExecutions.delete(executionKey);
  }
}
