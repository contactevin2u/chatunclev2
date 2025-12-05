import { query, queryOne, execute } from '../config/database';
import { sessionManager } from './whatsapp/SessionManager';
import { getIO } from './socket';
import { getRandomDelay, sleep, needsBatchCooldown } from './antiBan';

let processorInterval: NodeJS.Timeout | null = null;

// Process pending scheduled messages
async function processScheduledMessages() {
  try {
    // Get all pending messages that are due
    const pendingMessages = await query(`
      SELECT sm.*, c.whatsapp_account_id, ct.wa_id, wa.user_id
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      JOIN whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE sm.status = 'pending' AND sm.scheduled_at <= NOW()
      ORDER BY sm.scheduled_at ASC
      LIMIT 10
    `);

    for (let i = 0; i < pendingMessages.length; i++) {
      const msg = pendingMessages[i];

      try {
        console.log(`[Scheduler] Processing scheduled message ${msg.id} (${i + 1}/${pendingMessages.length})`);

        // === ANTI-BAN: Check batch cooldown for this account ===
        const batchCheck = needsBatchCooldown(msg.whatsapp_account_id);
        if (batchCheck.needed) {
          console.log(`[Scheduler] Batch cooldown needed for ${msg.whatsapp_account_id}, waiting ${batchCheck.waitMs}ms`);
          await sleep(batchCheck.waitMs);
        }

        // === ANTI-BAN: Add delay between scheduled messages ===
        if (i > 0) {
          const delay = getRandomDelay(3000, 8000); // 3-8 seconds between messages
          console.log(`[Scheduler] Anti-ban delay: ${delay}ms before sending`);
          await sleep(delay);
        }

        // Send the message (anti-ban measures built into sendMessage)
        const waMessageId = await sessionManager.sendMessage(
          msg.whatsapp_account_id,
          msg.wa_id,
          {
            type: msg.content_type,
            content: msg.content,
            mediaUrl: msg.media_url,
            mediaMimeType: msg.media_mime_type,
          }
        );

        // Save to messages table
        const savedMessage = await queryOne(`
          INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, agent_id)
          VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent', $7)
          RETURNING *
        `, [msg.conversation_id, waMessageId, msg.content_type, msg.content, msg.media_url, msg.media_mime_type, msg.agent_id]);

        // Update scheduled message status
        await execute(`
          UPDATE scheduled_messages SET status = 'sent', sent_at = NOW() WHERE id = $1
        `, [msg.id]);

        // Update conversation
        await execute(`
          UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1
        `, [msg.conversation_id]);

        // Notify frontend
        const io = getIO();
        io.to(`user:${msg.user_id}`).emit('message:new', {
          accountId: msg.whatsapp_account_id,
          conversationId: msg.conversation_id,
          message: savedMessage,
          isScheduled: true,
        });

        io.to(`user:${msg.user_id}`).emit('scheduled:sent', {
          scheduledMessageId: msg.id,
          messageId: savedMessage.id,
        });

        console.log(`[Scheduler] Scheduled message ${msg.id} sent successfully`);
      } catch (error: any) {
        console.error(`[Scheduler] Failed to send scheduled message ${msg.id}:`, error);

        // Mark as failed
        await execute(`
          UPDATE scheduled_messages SET status = 'failed', error_message = $1 WHERE id = $2
        `, [error.message, msg.id]);

        // Notify frontend
        const io = getIO();
        io.to(`user:${msg.user_id}`).emit('scheduled:failed', {
          scheduledMessageId: msg.id,
          error: error.message,
        });
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error processing scheduled messages:', error);
  }
}

// Start the scheduled message processor
export function startScheduledMessageProcessor() {
  if (processorInterval) {
    console.log('[Scheduler] Processor already running');
    return;
  }

  console.log('[Scheduler] Starting scheduled message processor');

  // Run every 30 seconds
  processorInterval = setInterval(processScheduledMessages, 30000);

  // Also run immediately
  processScheduledMessages();
}

// Stop the scheduled message processor
export function stopScheduledMessageProcessor() {
  if (processorInterval) {
    console.log('[Scheduler] Stopping scheduled message processor');
    clearInterval(processorInterval);
    processorInterval = null;
  }
}
