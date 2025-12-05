import { queryOne, execute } from '../config/database';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Generate AI response using OpenAI
export async function generateAIResponse(
  conversationId: string,
  userMessage: string,
  customPrompt?: string
): Promise<AIResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Get conversation context
  const context = await queryOne(`
    SELECT * FROM ai_conversation_context WHERE conversation_id = $1
  `, [conversationId]);

  // Get recent messages for context
  const recentMessages = await getRecentMessages(conversationId, 10);

  // Build messages array
  const messages: ChatMessage[] = [];

  // System prompt
  const systemPrompt = customPrompt || context?.system_prompt || getDefaultSystemPrompt();
  messages.push({
    role: 'system',
    content: systemPrompt + (context?.business_context ? `\n\nBusiness Context:\n${context.business_context}` : ''),
  });

  // Add conversation summary if available
  if (context?.conversation_summary) {
    messages.push({
      role: 'system',
      content: `Previous conversation summary: ${context.conversation_summary}`,
    });
  }

  // Add recent messages
  for (const msg of recentMessages) {
    messages.push({
      role: msg.sender_type === 'contact' ? 'user' : 'assistant',
      content: msg.content || '',
    });
  }

  // Add current message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  // Call OpenAI API
  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAIResponse;
  const aiContent = data.choices[0]?.message?.content || '';

  // Update conversation summary periodically
  if (recentMessages.length > 0 && recentMessages.length % 10 === 0) {
    await updateConversationSummary(conversationId, messages);
  }

  return {
    content: aiContent,
    usage: data.usage,
  };
}

// Get recent messages for context
async function getRecentMessages(conversationId: string, limit: number = 10) {
  const messages = await queryOne(`
    SELECT array_agg(
      json_build_object(
        'sender_type', sender_type,
        'content', content,
        'created_at', created_at
      ) ORDER BY created_at DESC
    ) as messages
    FROM (
      SELECT sender_type, content, created_at
      FROM messages
      WHERE conversation_id = $1 AND content IS NOT NULL AND content != ''
      ORDER BY created_at DESC
      LIMIT $2
    ) sub
  `, [conversationId, limit]);

  return (messages?.messages || []).reverse();
}

// Update conversation summary
async function updateConversationSummary(conversationId: string, messages: ChatMessage[]) {
  if (!OPENAI_API_KEY) return;

  try {
    const summaryMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Summarize this conversation in 2-3 sentences, focusing on key topics, customer needs, and any pending actions.',
      },
      {
        role: 'user',
        content: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
      },
    ];

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: summaryMessages,
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (response.ok) {
      const data = await response.json() as OpenAIResponse;
      const summary = data.choices[0]?.message?.content || '';

      await execute(`
        INSERT INTO ai_conversation_context (conversation_id, conversation_summary, last_updated)
        VALUES ($1, $2, NOW())
        ON CONFLICT (conversation_id) DO UPDATE SET
          conversation_summary = $2,
          last_updated = NOW()
      `, [conversationId, summary]);
    }
  } catch (error) {
    console.error('Failed to update conversation summary:', error);
  }
}

// Get default system prompt
function getDefaultSystemPrompt(): string {
  return `You are a helpful customer service assistant for a business. Your role is to:
1. Answer customer questions professionally and helpfully
2. Provide accurate information about products and services
3. Handle complaints and issues with empathy
4. Guide customers through processes
5. Escalate complex issues to human agents when needed

Keep responses concise and friendly. If you don't know something, say so honestly.
Always be polite and maintain a professional tone.`;
}

// Set business context for a conversation
export async function setBusinessContext(conversationId: string, context: string) {
  await execute(`
    INSERT INTO ai_conversation_context (conversation_id, business_context, last_updated)
    VALUES ($1, $2, NOW())
    ON CONFLICT (conversation_id) DO UPDATE SET
      business_context = $2,
      last_updated = NOW()
  `, [conversationId, context]);
}

// Set custom system prompt for a conversation
export async function setSystemPrompt(conversationId: string, prompt: string) {
  await execute(`
    INSERT INTO ai_conversation_context (conversation_id, system_prompt, last_updated)
    VALUES ($1, $2, NOW())
    ON CONFLICT (conversation_id) DO UPDATE SET
      system_prompt = $2,
      last_updated = NOW()
  `, [conversationId, prompt]);
}

// Check if AI is configured
export function isAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}
