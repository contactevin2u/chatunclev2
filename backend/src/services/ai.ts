import OpenAI from 'openai';
import { query, queryOne } from '../config/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Malaysian conversational style - casual and friendly
const MALAYSIAN_STYLE_PROMPT = `You are a friendly customer service assistant for a Malaysian business.
Respond in a warm, casual Malaysian style mixing Malay and English naturally (Manglish).

IMPORTANT RULES:
- Keep responses SHORT - 1 to 2 sentences MAX
- ONE message only, never multiple
- Be casual and friendly, not robotic
- Use "lah", "leh", "lor" naturally but sparingly
- Mix English and Malay like: "Okay lah", "Can can", "No problem boss"
- Use emojis sparingly (max 1-2)
- If unsure, say you'll check and get back
- NEVER repeat yourself or spam

Example tones:
- "Okay boss, can help! What you need?"
- "No worries lah, checking now"
- "Wah good question! So..."
- "Sure thing boss!"

Answer accurately using business knowledge.
If no specific info, be honest.`;

// Rate limiting per conversation - IMPORTANT for ban prevention
const conversationCooldowns = new Map<string, number>();
const COOLDOWN_MS = 5000; // 5 second minimum between AI replies

// Check if human agent recently replied (human takeover)
async function isHumanTakeover(conversationId: string, minutesThreshold: number = 30): Promise<boolean> {
  try {
    const lastAgentMessage = await queryOne(`
      SELECT created_at FROM messages
      WHERE conversation_id = $1 AND sender_type = 'agent' AND is_auto_reply = FALSE
      ORDER BY created_at DESC LIMIT 1
    `, [conversationId]);

    if (!lastAgentMessage) return false;

    const diffMinutes = (Date.now() - new Date(lastAgentMessage.created_at).getTime()) / 60000;
    return diffMinutes < minutesThreshold;
  } catch {
    return false;
  }
}

// Check consecutive AI replies to prevent spam (max 2)
async function getConsecutiveAIReplies(conversationId: string): Promise<number> {
  try {
    const messages = await query(`
      SELECT sender_type, is_auto_reply FROM messages
      WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10
    `, [conversationId]);

    if (!messages?.length) return 0;

    let count = 0;
    for (const msg of messages) {
      if (msg.sender_type === 'agent' && msg.is_auto_reply) {
        count++;
      } else {
        break;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// Check rate limit (prevent rapid fire)
function isRateLimited(conversationId: string): boolean {
  const lastReply = conversationCooldowns.get(conversationId);
  if (lastReply && Date.now() - lastReply < COOLDOWN_MS) {
    return true;
  }
  return false;
}

function setRateLimit(conversationId: string): void {
  conversationCooldowns.set(conversationId, Date.now());
  if (conversationCooldowns.size > 1000) {
    const cutoff = Date.now() - 60000;
    for (const [key, time] of conversationCooldowns) {
      if (time < cutoff) conversationCooldowns.delete(key);
    }
  }
}

// Search knowledge base
async function searchKnowledge(accountId: string, searchQuery: string): Promise<any[]> {
  try {
    const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const placeholders = words.map((_, i) => `LOWER(content) LIKE $${i + 2}`).join(' OR ');
    const results = await query(`
      SELECT content, document_name FROM knowledge_chunks
      WHERE whatsapp_account_id = $1 AND (${placeholders})
      LIMIT 3
    `, [accountId, ...words.map(w => `%${w}%`)]);

    return results || [];
  } catch {
    return [];
  }
}

// Get recent conversation context
async function getConversationContext(conversationId: string): Promise<string> {
  try {
    const messages = await query(`
      SELECT sender_type, content FROM messages
      WHERE conversation_id = $1 AND content_type = 'text' AND content IS NOT NULL
      ORDER BY created_at DESC LIMIT 4
    `, [conversationId]);

    if (!messages?.length) return '';

    return messages.reverse().map((m: any) =>
      `${m.sender_type === 'contact' ? 'Customer' : 'You'}: ${m.content}`
    ).join('\n');
  } catch {
    return '';
  }
}

// Get AI settings for account
export async function getAISettings(accountId: string): Promise<any> {
  try {
    const settings = await queryOne(`
      SELECT * FROM ai_settings WHERE whatsapp_account_id = $1
    `, [accountId]);

    return settings || {
      enabled: false,
      auto_reply: false,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 100,
      max_consecutive_replies: 2,
    };
  } catch {
    return { enabled: false };
  }
}

// Main function to generate AI response
export async function generateResponse(
  accountId: string,
  conversationId: string,
  customerMessage: string,
  contactName?: string
): Promise<string | null> {
  try {
    // 1. Check if AI is enabled
    const settings = await getAISettings(accountId);
    if (!settings.enabled || !settings.auto_reply) {
      return null;
    }

    // 2. Check rate limit (prevent rapid fire - BAN PREVENTION)
    if (isRateLimited(conversationId)) {
      console.log('[AI] Rate limited, skipping');
      return null;
    }

    // 3. Check for human takeover
    if (await isHumanTakeover(conversationId)) {
      console.log('[AI] Human takeover active');
      return null;
    }

    // 4. Check consecutive AI replies (max 2 - BAN PREVENTION)
    const consecutiveReplies = await getConsecutiveAIReplies(conversationId);
    const maxReplies = settings.max_consecutive_replies || 2;
    if (consecutiveReplies >= maxReplies) {
      console.log('[AI] Max consecutive replies reached:', consecutiveReplies);
      return null;
    }

    // 5. Check API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('[AI] No OpenAI API key');
      return null;
    }

    // Set rate limit now
    setRateLimit(conversationId);

    // Get knowledge and context
    const knowledge = await searchKnowledge(accountId, customerMessage);
    const knowledgeContext = knowledge.length > 0
      ? '\n\nBusiness info:\n' + knowledge.map(k => '- ' + k.content.substring(0, 150)).join('\n')
      : '';

    const history = await getConversationContext(conversationId);
    const systemPrompt = MALAYSIAN_STYLE_PROMPT + knowledgeContext;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (history) {
      messages.push({ role: 'user', content: `Recent chat:\n${history}\n\nReply to the latest message only. Keep it short.` });
    }

    messages.push({
      role: 'user',
      content: (contactName ? `${contactName}: ` : '') + customerMessage
    });

    console.log('[AI] Generating for:', customerMessage.substring(0, 40));

    const completion = await openai.chat.completions.create({
      model: settings.model || 'gpt-4o-mini',
      messages,
      temperature: settings.temperature || 0.7,
      max_tokens: settings.max_tokens || 100,
    });

    const response = completion.choices[0]?.message?.content;

    if (response) {
      console.log('[AI] Response:', response.substring(0, 40));

      // Log the interaction
      try {
        await query(`
          INSERT INTO ai_logs (whatsapp_account_id, conversation_id, customer_message, ai_response, model, tokens_used)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [accountId, conversationId, customerMessage, response, settings.model || 'gpt-4o-mini', completion.usage?.total_tokens || 0]);
      } catch (e) {
        // Ignore logging errors
      }
    }

    return response;
  } catch (error: any) {
    console.error('[AI] Error:', error.message);
    return null;
  }
}

// Process uploaded document for knowledge base
export async function processDocument(
  accountId: string,
  documentName: string,
  content: string | Buffer,
  mimeType: string
): Promise<{ success: boolean; chunks: number; error?: string }> {
  try {
    let textContent = '';

    if (mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      textContent = (await pdfParse(content)).text;
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      textContent = content.toString();
    } else if (mimeType.startsWith('image/')) {
      textContent = `[Image: ${documentName}]`;
    } else {
      return { success: false, chunks: 0, error: 'Unsupported file type' };
    }

    const doc = await queryOne(`
      INSERT INTO knowledge_documents (whatsapp_account_id, name, mime_type, content_length)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [accountId, documentName, mimeType, textContent.length]);

    if (!doc) {
      return { success: false, chunks: 0, error: 'Failed to create document' };
    }

    const chunks = splitIntoChunks(textContent, 600);

    for (let i = 0; i < chunks.length; i++) {
      await query(`
        INSERT INTO knowledge_chunks (whatsapp_account_id, document_id, document_name, content, chunk_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [accountId, doc.id, documentName, chunks[i], i]);
    }

    console.log(`[AI] Processed ${documentName}: ${chunks.length} chunks`);
    return { success: true, chunks: chunks.length };
  } catch (error: any) {
    console.error('[AI] Document error:', error);
    return { success: false, chunks: 0, error: error.message };
  }
}

function splitIntoChunks(text: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const para of text.split(/\n\n+/)) {
    if (current.length + para.length > maxSize) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 10);
}

export default { generateResponse, processDocument, getAISettings, searchKnowledge };
