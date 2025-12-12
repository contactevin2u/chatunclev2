import OpenAI from 'openai';
import { query, queryOne, execute } from '../config/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default Bahasa Melayu sales assistant prompt - used when no custom_prompt set
const DEFAULT_PROMPT = `Anda adalah pembantu jualan peralatan perubatan untuk keluarga Malaysia.
Produk: Katil hospital, kerusi roda, oxygen concentrator (sewa atau ansuran ada).

Balas dalam Bahasa Melayu yang santai, penuh empati macam kawan yang faham.

PERATURAN PENTING:
- Jawapan PENDEK - 1 hingga 2 ayat sahaja
- SATU mesej, jangan spam
- Santai tapi profesional, tunjuk anda faham situasi mereka
- Guna "ye", "tau", "lah" secara semulajadi
- Emoji sikit je bila sesuai 🙏

KONTEKS PELANGGAN:
- Biasanya anak/cucu beli untuk ibu bapa/datuk nenek
- Ini pasal jaga orang tersayang (berbakti/filial piety)
- Kadang urgent (baru keluar hospital, sakit tiba-tiba)
- Ramai risau pasal harga - tawarkan sewa/ansuran

TEKNIK JUALAN:
1. FAHAM SITUASI - Tanya dengan empati:
   "Untuk siapa ye? Ibu/ayah?"
   "Ada masalah apa? Susah jalan ke susah nafas?"
   "Baru keluar hospital ke?"
   "Nak sewa dulu atau terus beli?"

2. CADANG SESUAI - Based on keperluan:
   "Kalau susah bangun, katil elektrik senang sikit - boleh adjust"
   "Untuk oxygen, yang 5L cukup untuk kebanyakan kes"
   "Ramai start sewa dulu, kalau okay baru convert ke beli"

3. CLOSE - Arah ke tindakan:
   "Nak saya arrange hantar esok?"
   "Boleh saya call explain detail sikit?"
   "Ada slot petang ni untuk demo, nak book?"

4. HANDLE HARGA - Tawarkan flexibility:
   "Ada ansuran 0% 6 bulan, senang sikit"
   "Sewa dulu RM___/bulan, test dulu"
   "Kalau urgent, boleh hantar hari ni jugak"

JANGAN:
- Jangan terlalu salesy - ini pasal jaga family
- Jangan cakap "saya AI" atau "saya robot"
- Jangan tinggalkan tanpa next step
- Jangan assume harga - check knowledge bank dulu

NADA YANG BETUL:
- "Faham, memang susah bila orang tersayang sakit 🙏"
- "Okay, saya faham. Yang ni ramai guna untuk kes macam ni"
- "Jangan risau, boleh sewa dulu kalau tak pasti"
- "Esok pagi boleh hantar, senang untuk mak/ayah ye"

PENTING: Guna maklumat dari knowledge bank untuk harga dan spesifikasi.
Kalau tak pasti, jujur cakap "Saya check dengan team dulu ye".`;

// Rate limiting defaults - can be overridden by ai_settings
const DEFAULT_COOLDOWN_MS = 10000; // 10 second minimum between AI replies
const DEFAULT_MAX_REPLIES_PER_HOUR = 4; // Max 4 AI messages per hour per contact

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

// Database-backed rate limiting (persists across restarts)
async function checkRateLimits(
  conversationId: string,
  settings: any
): Promise<{ limited: boolean; reason?: string }> {
  try {
    const cooldownMs = settings.cooldown_seconds ? settings.cooldown_seconds * 1000 : DEFAULT_COOLDOWN_MS;
    const maxPerHour = settings.hourly_limit || DEFAULT_MAX_REPLIES_PER_HOUR;

    // Get or create rate limit record
    const limits = await queryOne(`
      SELECT last_reply_at, hourly_count, hourly_reset_at
      FROM ai_rate_limits WHERE conversation_id = $1
    `, [conversationId]);

    const now = new Date();

    if (!limits) {
      // No limits record yet - not rate limited
      return { limited: false };
    }

    // Check cooldown (time since last reply)
    if (limits.last_reply_at) {
      const msSinceLastReply = now.getTime() - new Date(limits.last_reply_at).getTime();
      if (msSinceLastReply < cooldownMs) {
        return { limited: true, reason: `cooldown (${Math.ceil((cooldownMs - msSinceLastReply) / 1000)}s remaining)` };
      }
    }

    // Check hourly limit
    if (limits.hourly_reset_at && now < new Date(limits.hourly_reset_at)) {
      if (limits.hourly_count >= maxPerHour) {
        const minsRemaining = Math.ceil((new Date(limits.hourly_reset_at).getTime() - now.getTime()) / 60000);
        return { limited: true, reason: `hourly limit ${maxPerHour}/hr (resets in ${minsRemaining}min)` };
      }
    }

    return { limited: false };
  } catch (error) {
    console.error('[AI] Rate limit check error:', error);
    return { limited: false }; // Fail open to avoid blocking
  }
}

// Record that we sent an AI reply (updates rate limits)
async function recordAIReply(conversationId: string): Promise<void> {
  try {
    const now = new Date();
    const hourFromNow = new Date(now.getTime() + 3600000);

    await execute(`
      INSERT INTO ai_rate_limits (conversation_id, last_reply_at, hourly_count, hourly_reset_at)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (conversation_id) DO UPDATE SET
        last_reply_at = $2,
        hourly_count = CASE
          WHEN ai_rate_limits.hourly_reset_at IS NULL OR ai_rate_limits.hourly_reset_at < $2
          THEN 1
          ELSE ai_rate_limits.hourly_count + 1
        END,
        hourly_reset_at = CASE
          WHEN ai_rate_limits.hourly_reset_at IS NULL OR ai_rate_limits.hourly_reset_at < $2
          THEN $3
          ELSE ai_rate_limits.hourly_reset_at
        END,
        updated_at = NOW()
    `, [conversationId, now, hourFromNow]);
  } catch (error) {
    console.error('[AI] Record rate limit error:', error);
  }
}

// Search knowledge base with improved full-text search
export async function searchKnowledge(accountId: string, searchQuery: string): Promise<any[]> {
  try {
    // Clean search query
    const cleanQuery = searchQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 10) // Limit to 10 words
      .join(' ');

    if (!cleanQuery) return [];

    // Try PostgreSQL full-text search first (faster and better ranking)
    try {
      const ftsResults = await query(`
        SELECT content, document_name,
          ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $2)) as rank
        FROM knowledge_chunks
        WHERE COALESCE(account_id, whatsapp_account_id) = $1
          AND to_tsvector('simple', content) @@ plainto_tsquery('simple', $2)
        ORDER BY rank DESC
        LIMIT 5
      `, [accountId, cleanQuery]);

      if (ftsResults && ftsResults.length > 0) {
        return ftsResults;
      }
    } catch (ftsError) {
      // FTS might fail if index doesn't exist yet, fall back to LIKE
      console.log('[AI] FTS search failed, falling back to LIKE:', ftsError);
    }

    // Fallback to LIKE-based search
    const words = cleanQuery.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const placeholders = words.map((_, i) => `LOWER(content) LIKE $${i + 2}`).join(' OR ');
    const results = await query(`
      SELECT content, document_name FROM knowledge_chunks
      WHERE COALESCE(account_id, whatsapp_account_id) = $1 AND (${placeholders})
      LIMIT 5
    `, [accountId, ...words.map(w => `%${w}%`)]);

    return results || [];
  } catch (error) {
    console.error('[AI] Knowledge search error:', error);
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
      SELECT * FROM ai_settings WHERE COALESCE(account_id, whatsapp_account_id) = $1
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

/**
 * Unified AI response generator
 * Handles both:
 * - General AI auto-reply (when no rules match)
 * - Rule-based AI with custom prompts
 *
 * @param accountId - WhatsApp account ID
 * @param conversationId - Conversation ID
 * @param customerMessage - The customer's message
 * @param options - Optional settings
 *   - customPrompt: Override system prompt (for rule-based AI)
 *   - contactName: Customer name for personalization
 *   - skipSettingsCheck: Skip enabled/auto_reply check (for rule-based AI)
 */
export async function generateResponse(
  accountId: string,
  conversationId: string,
  customerMessage: string,
  options?: {
    customPrompt?: string;
    contactName?: string;
    skipSettingsCheck?: boolean;
  }
): Promise<string | null> {
  const { customPrompt, contactName, skipSettingsCheck } = options || {};

  try {
    // 1. Get AI settings
    const settings = await getAISettings(accountId);

    // 2. Check if AI is enabled (skip for rule-based AI which has its own checks)
    if (!skipSettingsCheck) {
      if (!settings.enabled || !settings.auto_reply) {
        console.log('[AI] Not enabled for account');
        return null;
      }
    }

    // 3. Check rate limits (database-backed, persists across restarts)
    const rateLimitResult = await checkRateLimits(conversationId, settings);
    if (rateLimitResult.limited) {
      console.log(`[AI] Rate limited: ${rateLimitResult.reason}`);
      return null;
    }

    // 4. Check for human takeover
    if (await isHumanTakeover(conversationId)) {
      console.log('[AI] Human takeover active, skipping');
      return null;
    }

    // 5. Check consecutive AI replies (max 2 - BAN PREVENTION)
    const consecutiveReplies = await getConsecutiveAIReplies(conversationId);
    const maxReplies = settings.max_consecutive_replies || 2;
    if (consecutiveReplies >= maxReplies) {
      console.log(`[AI] Max consecutive replies reached: ${consecutiveReplies}/${maxReplies}`);
      return null;
    }

    // 6. Check API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('[AI] No OpenAI API key configured');
      return null;
    }

    // 7. Search knowledge bank for context
    const knowledge = await searchKnowledge(accountId, customerMessage);
    const knowledgeContext = knowledge.length > 0
      ? '\n\nBusiness info from knowledge bank:\n' + knowledge.map(k => '- ' + k.content.substring(0, 200)).join('\n')
      : '';

    // 8. Determine base prompt (priority: customPrompt > settings.custom_prompt > DEFAULT_PROMPT)
    let basePrompt: string;
    if (customPrompt) {
      // Rule-based AI with custom prompt
      basePrompt = customPrompt;
      console.log('[AI] Using rule custom prompt');
    } else if (settings.custom_prompt) {
      // Account-level custom prompt
      basePrompt = settings.custom_prompt;
      console.log('[AI] Using account custom prompt');
    } else {
      // Default prompt
      basePrompt = DEFAULT_PROMPT;
    }

    const systemPrompt = basePrompt + knowledgeContext;

    // 9. Get conversation history for context
    const history = await getConversationContext(conversationId);

    // 10. Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (history) {
      messages.push({
        role: 'user',
        content: `Recent conversation:\n${history}\n\nReply to the latest message only. Keep it short and natural.`
      });
    }

    messages.push({
      role: 'user',
      content: (contactName ? `${contactName}: ` : '') + customerMessage
    });

    console.log('[AI] Generating response for:', customerMessage.substring(0, 50));

    // 11. Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: settings.model || 'gpt-4o-mini',
      messages,
      temperature: settings.temperature || 0.7,
      max_tokens: settings.max_tokens || 100,
    });

    const response = completion.choices[0]?.message?.content;

    if (response) {
      // 12. Record rate limit AFTER successful response
      await recordAIReply(conversationId);

      console.log('[AI] Generated:', response.substring(0, 50));

      // 13. Log the interaction for analytics
      try {
        await query(`
          INSERT INTO ai_logs (account_id, conversation_id, customer_message, ai_response, model, tokens_used)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [accountId, conversationId, customerMessage, response, settings.model || 'gpt-4o-mini', completion.usage?.total_tokens || 0]);
      } catch (e) {
        // Ignore logging errors
      }
    }

    return response || null;
  } catch (error: any) {
    console.error('[AI] Error generating response:', error.message);
    return null;
  }
}

// Legacy compatibility wrapper (for existing callers using positional contactName)
export async function generateResponseLegacy(
  accountId: string,
  conversationId: string,
  customerMessage: string,
  contactName?: string
): Promise<string | null> {
  return generateResponse(accountId, conversationId, customerMessage, { contactName });
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
      INSERT INTO knowledge_documents (account_id, name, mime_type, content_length)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [accountId, documentName, mimeType, textContent.length]);

    if (!doc) {
      return { success: false, chunks: 0, error: 'Failed to create document' };
    }

    const chunks = splitIntoChunks(textContent, 600);

    for (let i = 0; i < chunks.length; i++) {
      await query(`
        INSERT INTO knowledge_chunks (account_id, document_id, document_name, content, chunk_index)
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

export default { generateResponse, generateResponseLegacy, processDocument, getAISettings, searchKnowledge };
