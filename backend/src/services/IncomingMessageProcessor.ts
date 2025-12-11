/**
 * IncomingMessageProcessor
 *
 * Consolidated message processing for all channels (WhatsApp, Telegram, TikTok, Meta).
 * Eliminates duplicate message handling logic across route files.
 *
 * Responsibilities:
 * - Message deduplication
 * - Contact lookup/creation
 * - Conversation lookup/creation
 * - Message saving with reply context
 * - Socket.io emissions
 * - Auto-reply triggering
 */

import { query, queryOne, execute } from '../config/database';
import { getIO } from './socket';
import { IncomingMessage, ChannelType } from './channel/types';

interface ProcessedMessage {
  messageId: string;
  conversationId: string;
  contactId: string;
  accountId: string;
  isNew: boolean;
}

interface ProcessingResult {
  success: boolean;
  message?: ProcessedMessage;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * Get the channel-specific user ID column name for contacts table
 */
function getContactUserIdColumn(channelType: ChannelType): string {
  switch (channelType) {
    case 'telegram': return 'telegram_user_id';
    case 'tiktok': return 'tiktok_user_id';
    case 'instagram': return 'instagram_user_id';
    case 'messenger': return 'messenger_user_id';
    case 'whatsapp': return 'wa_id';
    default: return 'wa_id';
  }
}

/**
 * Get the channel-specific conversation ID column name
 */
function getConversationIdColumn(channelType: ChannelType): string {
  switch (channelType) {
    case 'telegram': return 'telegram_chat_id';
    case 'tiktok': return 'tiktok_conversation_id';
    case 'instagram': return 'instagram_conversation_id';
    case 'messenger': return 'messenger_conversation_id';
    case 'whatsapp': return 'contact_id'; // WhatsApp uses contact_id for 1:1
    default: return 'contact_id';
  }
}

/**
 * Generate a unified contact identifier (wa_id column value)
 */
function generateContactWaId(channelType: ChannelType, senderId: string): string {
  switch (channelType) {
    case 'telegram': return `tg:${senderId}`;
    case 'tiktok': return `tt:${senderId}`;
    case 'instagram': return `ig:${senderId}`;
    case 'messenger': return `fb:${senderId}`;
    case 'whatsapp': return senderId; // Already in correct format
    default: return senderId;
  }
}

/**
 * Process an incoming message from any channel
 * Handles deduplication, contact/conversation management, and storage
 */
export async function processIncomingMessage(
  message: IncomingMessage
): Promise<ProcessingResult> {
  const { channelType, channelAccountId, channelMessageId, chatId, senderId } = message;

  try {
    // === 1. DEDUPLICATION ===
    const existingMsg = await queryOne<{ id: string }>(
      `SELECT id FROM messages WHERE wa_message_id = $1 AND channel_type = $2`,
      [channelMessageId, channelType]
    );

    if (existingMsg) {
      console.log(`[MessageProcessor] Duplicate ${channelType} message ${channelMessageId}, skipping`);
      return { success: true, isDuplicate: true };
    }

    // === 2. GET ACCOUNT ===
    const account = await queryOne<{ id: string; user_id: string; name: string }>(
      `SELECT id, user_id, name FROM accounts WHERE id = $1 AND channel_type = $2`,
      [channelAccountId, channelType]
    );

    if (!account) {
      return { success: false, error: `Account not found: ${channelAccountId}` };
    }

    // === 3. FIND OR CREATE CONTACT ===
    const contactUserIdColumn = getContactUserIdColumn(channelType);
    const waId = generateContactWaId(channelType, senderId);

    let contact = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM contacts WHERE ${contactUserIdColumn} = $1 AND account_id = $2`,
      [channelType === 'whatsapp' ? waId : senderId, account.id]
    );

    if (!contact) {
      // Create new contact
      const displayName = message.senderName || `${channelType} User`;

      contact = await queryOne<{ id: string; name: string }>(
        `INSERT INTO contacts (account_id, wa_id, name, channel_type, ${contactUserIdColumn})
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, ${contactUserIdColumn})
         WHERE account_id IS NOT NULL AND ${contactUserIdColumn} IS NOT NULL
         DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name), updated_at = NOW()
         RETURNING id, name`,
        [account.id, waId, displayName, channelType, channelType === 'whatsapp' ? waId : senderId]
      );

      console.log(`[MessageProcessor] Created/updated contact: ${contact?.id}`);
    }

    if (!contact) {
      return { success: false, error: 'Failed to create contact' };
    }

    // === 4. FIND OR CREATE CONVERSATION ===
    const conversationIdColumn = getConversationIdColumn(channelType);
    const conversationLookupValue = channelType === 'whatsapp' ? contact.id : chatId;

    let conversation = await queryOne<{ id: string }>(
      `SELECT id FROM conversations WHERE account_id = $1 AND ${conversationIdColumn} = $2`,
      [account.id, conversationLookupValue]
    );

    if (!conversation) {
      // Build insert query dynamically based on channel type
      const insertColumns = ['account_id', 'contact_id', 'is_group', 'channel_type'];
      const insertValues = [account.id, contact.id, message.isGroup, channelType];
      const insertParams = ['$1', '$2', '$3', '$4'];

      // Add channel-specific conversation ID
      if (channelType !== 'whatsapp') {
        insertColumns.push(conversationIdColumn);
        insertValues.push(chatId);
        insertParams.push(`$${insertParams.length + 1}`);
      }

      conversation = await queryOne<{ id: string }>(
        `INSERT INTO conversations (${insertColumns.join(', ')})
         VALUES (${insertParams.join(', ')})
         ON CONFLICT (account_id, ${conversationIdColumn})
         WHERE account_id IS NOT NULL AND ${conversationIdColumn} IS NOT NULL
         DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        insertValues
      );

      console.log(`[MessageProcessor] Created/updated conversation: ${conversation?.id}`);
    }

    if (!conversation) {
      return { success: false, error: 'Failed to create conversation' };
    }

    // === 5. LOOK UP QUOTED MESSAGE (if reply) ===
    let quotedMessageId: string | null = null;
    if (message.replyToMessageId) {
      const quotedMsg = await queryOne<{ id: string }>(
        `SELECT id FROM messages WHERE wa_message_id = $1 AND channel_type = $2`,
        [message.replyToMessageId, channelType]
      );
      quotedMessageId = quotedMsg?.id || null;
    }

    // === 6. SAVE MESSAGE ===
    const savedMessage = await queryOne<{
      id: string;
      conversation_id: string;
      wa_message_id: string;
      sender_type: string;
      content_type: string;
      content: string;
      created_at: Date;
    }>(
      `INSERT INTO messages (
        conversation_id, wa_message_id, sender_type, content_type, content,
        media_url, media_mime_type, raw_message, channel_type,
        quoted_message_id, quoted_wa_message_id, quoted_content, quoted_sender_name,
        sender_name
      )
      VALUES ($1, $2, 'contact', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        conversation.id,
        channelMessageId,
        message.contentType,
        message.content || message.caption || '',
        message.mediaUrl || null,
        message.mediaMimeType || null,
        message.rawMessage ? JSON.stringify(message.rawMessage) : null,
        channelType,
        quotedMessageId,
        message.replyToMessageId || null,
        message.replyToContent || null,
        message.replyToSenderName || null,
        message.senderName || null,
      ]
    );

    if (!savedMessage) {
      return { success: false, error: 'Failed to save message' };
    }

    // === 7. UPDATE CONVERSATION ===
    await execute(
      `UPDATE conversations
       SET last_message_at = NOW(), unread_count = unread_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    // === 8. EMIT SOCKET EVENT ===
    const io = getIO();
    io.to(`account:${account.id}`).emit('message:new', {
      accountId: account.id,
      conversationId: conversation.id,
      channelType,
      message: {
        ...savedMessage,
        sender_name: message.senderName,
      },
      contact: {
        id: contact.id,
        name: contact.name,
      },
    });

    console.log(`[MessageProcessor] ${channelType} message processed: ${savedMessage.id}`);

    return {
      success: true,
      message: {
        messageId: savedMessage.id,
        conversationId: conversation.id,
        contactId: contact.id,
        accountId: account.id,
        isNew: true,
      },
    };
  } catch (error: any) {
    console.error(`[MessageProcessor] Error processing ${channelType} message:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Batch process multiple messages (for history sync)
 */
export async function processIncomingMessages(
  messages: IncomingMessage[]
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (const message of messages) {
    const result = await processIncomingMessage(message);
    results.push(result);
  }

  return results;
}

/**
 * Check if a message already exists (for external deduplication checks)
 */
export async function messageExists(
  channelMessageId: string,
  channelType: ChannelType
): Promise<boolean> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM messages WHERE wa_message_id = $1 AND channel_type = $2`,
    [channelMessageId, channelType]
  );
  return !!existing;
}

export default {
  processIncomingMessage,
  processIncomingMessages,
  messageExists,
};
