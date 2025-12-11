import { query, queryOne, execute } from '../config/database';
import { sessionManager } from './whatsapp/SessionManager';
import { generateResponse, getAISettings } from './ai';
import { getIO } from './socket';
import { getRandomDelay, sleep, isInWarmupPeriod } from './antiBan';

function isAIConfigured() { return !!process.env.OPENAI_API_KEY; }

interface IncomingMessage {
  accountId: string;
  conversationId: string;
  contactWaId: string;
  jidType?: 'lid' | 'pn';  // JID type for LID vs PN format
  content: string;
  userId: string;
}

// Check and process auto-reply rules for an incoming message
export async function processAutoReply(message: IncomingMessage): Promise<boolean> {
  try {
    const { accountId, conversationId, contactWaId, jidType, content, userId } = message;

    if (!content || content.trim() === '') {
      return false;
    }

    // ============================================================
    // RULE-BASED AUTO-REPLY (DISABLED)
    // ============================================================
    // Commented out to use only General AI for more natural, open-ended responses.
    // Rules are rigid (keyword/regex matching) while General AI understands context.
    // Uncomment this section if you need specific keyword triggers in the future.
    // ============================================================
    /*
    // Get active auto-reply rules for this account (or global rules)
    const rules = await query(`
      SELECT ar.*, t.content as template_content
      FROM auto_reply_rules ar
      LEFT JOIN templates t ON ar.response_template_id = t.id
      WHERE ar.user_id = $1
        AND ar.is_active = TRUE
        AND (ar.whatsapp_account_id = $2 OR ar.whatsapp_account_id IS NULL)
      ORDER BY ar.priority DESC, ar.created_at ASC
    `, [userId, accountId]);

    for (const rule of rules) {
      let matches = false;

      // Check trigger conditions
      if (rule.trigger_type === 'keyword' && rule.trigger_keywords) {
        const contentLower = content.toLowerCase();
        matches = rule.trigger_keywords.some((keyword: string) =>
          contentLower.includes(keyword.toLowerCase())
        );
      } else if (rule.trigger_type === 'regex' && rule.trigger_regex) {
        try {
          const regex = new RegExp(rule.trigger_regex, 'i');
          matches = regex.test(content);
        } catch (e) {
          console.error(`[AutoReply] Invalid regex in rule ${rule.id}:`, e);
        }
      } else if (rule.trigger_type === 'all') {
        matches = true;
      }

      if (!matches) {
        continue;
      }

      console.log(`[AutoReply] Rule ${rule.id} (${rule.name}) matched for message in conversation ${conversationId}`);

      let responseContent = '';

      // Determine response content
      if (rule.use_ai && isAIConfigured()) {
        // === FIXED: Use unified generateResponse with custom prompt ===
        // Now properly integrates with knowledge bank and uses rule's ai_prompt
        try {
          console.log(`[AutoReply] Using AI with custom prompt for rule ${rule.name}`);
          const aiResponse = await generateResponse(
            accountId,
            conversationId,
            content,
            {
              customPrompt: rule.ai_prompt,      // Rule's custom AI prompt
              skipSettingsCheck: true,           // Rules bypass account AI settings
            }
          );

          if (aiResponse) {
            responseContent = aiResponse;
            console.log(`[AutoReply] AI generated response: ${aiResponse.substring(0, 50)}...`);
          } else {
            console.log(`[AutoReply] AI returned null (rate limited or other check failed)`);
            // Fall back to static response if available
            responseContent = rule.response_content || rule.template_content || '';
          }
        } catch (error) {
          console.error(`[AutoReply] AI generation failed:`, error);
          // Fall back to static response if available
          responseContent = rule.response_content || rule.template_content || '';
        }
      } else if (rule.response_type === 'template' && rule.template_content) {
        responseContent = rule.template_content;
      } else if (rule.response_content) {
        responseContent = rule.response_content;
      }

      if (!responseContent) {
        console.log(`[AutoReply] No response content for rule ${rule.id}, trying next rule`);
        continue;
      }

      // Replace placeholders in response
      responseContent = replacePlaceholders(responseContent, {
        contact_message: content,
      });

      // Send the response
      const sent = await sendAutoReply(
        accountId,
        conversationId,
        contactWaId,
        jidType,
        responseContent,
        userId,
        rule.name,
        rule.use_ai ? 'ai_rule' : 'static_rule'
      );

      if (sent) {
        return true; // Stop processing after first successful match
      }
    }
    */
    // ============================================================
    // END RULE-BASED AUTO-REPLY (DISABLED)
    // ============================================================

    // === GENERAL AI AUTO-REPLY (Natural Language) ===
    // Try AI-powered response using GPT if enabled for this account
    try {
      const contact = await queryOne(`
        SELECT name FROM contacts c
        JOIN conversations conv ON conv.contact_id = c.id
        WHERE conv.id = $1
      `, [conversationId]);

      // Use unified generateResponse (checks ai_settings.enabled and auto_reply)
      const aiResponse = await generateResponse(
        accountId,
        conversationId,
        content,
        {
          contactName: contact?.name,
          // Don't skip settings check - respect account AI enable/disable
        }
      );

      if (aiResponse) {
        const sent = await sendAutoReply(
          accountId,
          conversationId,
          contactWaId,
          jidType,
          aiResponse,
          userId,
          'AI Assistant',
          'ai_fallback'
        );
        return sent;
      }
    } catch (error) {
      console.error('[AI AutoReply] Error:', error);
    }

    return false;
  } catch (error) {
    console.error('[AutoReply] Error processing auto-reply:', error);
    return false;
  }
}

/**
 * Send an auto-reply message with proper anti-ban delays and logging
 */
async function sendAutoReply(
  accountId: string,
  conversationId: string,
  contactWaId: string,
  jidType: 'lid' | 'pn' | undefined,
  responseContent: string,
  userId: string,
  ruleName: string,
  responseType: 'static_rule' | 'ai_rule' | 'ai_fallback'
): Promise<boolean> {
  try {
    // === ANTI-BAN: Add delay before auto-reply to simulate human reading ===
    // Research: 30-60s recommended, but we balance with UX (5-15s normal, 10-25s warmup)
    const isWarmup = await isInWarmupPeriod(accountId);
    const baseDelay = isWarmup ? 10000 : 5000; // 10s warmup, 5s normal (min)
    const maxDelay = isWarmup ? 25000 : 15000; // 25s warmup, 15s normal (max)
    const readingDelay = getRandomDelay(baseDelay, maxDelay);
    console.log(`[AutoReply] Waiting ${readingDelay}ms before responding (warmup: ${isWarmup}, type: ${responseType})`);
    await sleep(readingDelay);

    // Send the auto-reply (anti-ban measures are built into sendMessage)
    const waMessageId = await sessionManager.sendMessage(accountId, contactWaId, {
      type: 'text',
      content: responseContent,
    }, {
      jidType: jidType || 'pn',  // Use stored JID type for correct format
    });

    // Get last contact message timestamp for response time calculation
    const lastContactMessage = await queryOne(`
      SELECT created_at FROM messages
      WHERE conversation_id = $1 AND sender_type = 'contact'
      ORDER BY created_at DESC
      LIMIT 1
    `, [conversationId]);

    const responseTimeMs = lastContactMessage
      ? Date.now() - new Date(lastContactMessage.created_at).getTime()
      : null;

    // Save to messages table with is_auto_reply flag
    const savedMessage = await queryOne(`
      INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, status, is_auto_reply, response_time_ms)
      VALUES ($1, $2, 'agent', 'text', $3, 'sent', TRUE, $4)
      RETURNING *
    `, [conversationId, waMessageId, responseContent, responseTimeMs]);

    // Update conversation
    await execute(`
      UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1
    `, [conversationId]);

    // Track first response time if not set
    await execute(`
      UPDATE conversations
      SET first_response_at = COALESCE(first_response_at, NOW())
      WHERE id = $1
    `, [conversationId]);

    // Notify frontend (emit to account room for multi-agent sync)
    const io = getIO();
    io.to(`account:${accountId}`).emit('message:new', {
      accountId,
      conversationId,
      message: savedMessage,
      isAutoReply: true,
      ruleName,
      responseType,
    });

    console.log(`[AutoReply] Sent (${responseType}): ${ruleName} - ${responseContent.substring(0, 50)}...`);

    // Log activity
    await execute(`
      INSERT INTO agent_activity_logs (agent_id, action_type, entity_type, entity_id, details)
      VALUES ($1, 'auto_reply_triggered', 'conversation', $2, $3)
    `, [userId, conversationId, JSON.stringify({ rule_name: ruleName, response_type: responseType })]);

    return true;
  } catch (error) {
    console.error(`[AutoReply] Failed to send auto-reply:`, error);
    return false;
  }
}

// Replace placeholders in response content
function replacePlaceholders(content: string, data: Record<string, string>): string {
  let result = content;

  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return result;
}
