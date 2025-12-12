import { eq, and, desc, sql, lt, gt } from 'drizzle-orm';
import { db, messages, conversations, contacts } from '../../db/index.js';
import { getChannelRouter } from '../../channels/router.js';
import { getDeduplicator } from '../../services/deduplication.js';
import { broadcastNewMessage, broadcastMessageStatus } from '../../realtime/socket.js';
import { updateConversationOnNewMessage, getConversationById } from '../conversations/service.js';
import { generateTempId } from '@chatuncle/shared';
import type { ChannelType, ContentType, MessageStatus } from '@chatuncle/shared';

export interface MessageWithSender {
  id: string;
  conversationId: string;
  channelMessageId: string;
  channelType: ChannelType;
  senderType: 'agent' | 'contact' | 'system';
  contentType: ContentType;
  content: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  status: MessageStatus;
  agentId: string | null;
  isAutoReply: boolean;
  senderName: string | null;
  reactions: unknown[];
  isEdited: boolean;
  quotedContent: string | null;
  quotedSenderName: string | null;
  createdAt: Date;
}

export interface GetMessagesParams {
  conversationId: string;
  limit?: number;
  before?: string; // Message ID for pagination
  after?: string;
}

export interface SendMessageParams {
  accountId: string;
  conversationId: string;
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  replyToMessageId?: string;
  agentId: string;
  tempId?: string;
}

/**
 * Get messages for a conversation with cursor-based pagination
 */
export async function getMessages(
  params: GetMessagesParams
): Promise<{ messages: MessageWithSender[]; hasMore: boolean }> {
  const { conversationId, limit = 50, before, after } = params;

  const conditions = [eq(messages.conversationId, conversationId)];

  if (before) {
    // Get the timestamp of the before message
    const beforeMsg = await db.query.messages.findFirst({
      where: eq(messages.id, before),
    });
    if (beforeMsg) {
      conditions.push(lt(messages.createdAt, beforeMsg.createdAt));
    }
  }

  if (after) {
    const afterMsg = await db.query.messages.findFirst({
      where: eq(messages.id, after),
    });
    if (afterMsg) {
      conditions.push(gt(messages.createdAt, afterMsg.createdAt));
    }
  }

  const results = await db.query.messages.findMany({
    where: and(...conditions),
    orderBy: [desc(messages.createdAt)],
    limit: limit + 1, // Get one extra to check hasMore
  });

  const hasMore = results.length > limit;
  const messageList = hasMore ? results.slice(0, limit) : results;

  return {
    messages: messageList.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      channelMessageId: m.channelMessageId,
      channelType: m.channelType as ChannelType,
      senderType: m.senderType as 'agent' | 'contact' | 'system',
      contentType: m.contentType as ContentType,
      content: m.content,
      mediaUrl: m.mediaUrl,
      mediaMimeType: m.mediaMimeType,
      status: m.status as MessageStatus,
      agentId: m.agentId,
      isAutoReply: m.isAutoReply,
      senderName: m.senderName,
      reactions: (m.reactions as unknown[]) || [],
      isEdited: m.isEdited,
      quotedContent: m.quotedContent,
      quotedSenderName: m.quotedSenderName,
      createdAt: m.createdAt,
    })).reverse(), // Return in chronological order
    hasMore,
  };
}

/**
 * Send a message through the channel
 */
export async function sendMessage(params: SendMessageParams): Promise<{
  success: boolean;
  message?: MessageWithSender;
  error?: string;
}> {
  const {
    accountId,
    conversationId,
    contentType,
    content,
    mediaUrl,
    mediaMimeType,
    replyToMessageId,
    agentId,
    tempId,
  } = params;

  try {
    // Get conversation details
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    // Get recipient ID
    let recipientId: string;
    if (conversation.isGroup && conversation.group) {
      // Get group JID from database
      const group = await db.query.groups.findFirst({
        where: eq(conversations.id, conversation.group.id),
      });
      recipientId = group?.groupJid || '';
    } else if (conversation.contact) {
      // Get contact's channel ID
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.id, conversation.contact.id),
      });
      recipientId = contact?.channelContactId || contact?.waId || '';
    } else {
      return { success: false, error: 'No recipient found' };
    }

    if (!recipientId) {
      return { success: false, error: 'Could not determine recipient' };
    }

    // Create pending message in database
    const channelMessageId = tempId || generateTempId();
    const [pendingMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        channelMessageId,
        channelType: conversation.channelType,
        senderType: 'agent',
        contentType,
        content,
        mediaUrl,
        mediaMimeType,
        status: 'pending',
        agentId,
        isAutoReply: false,
        quotedChannelMessageId: replyToMessageId,
      })
      .returning();

    // Pre-mark in deduplication cache
    const dedup = getDeduplicator();
    dedup.preMark(accountId, channelMessageId);

    // Send through channel router
    const router = getChannelRouter();
    const result = await router.sendMessage({
      accountId,
      channelType: conversation.channelType,
      recipientId,
      contentType,
      content,
      mediaUrl,
      replyToMessageId,
      isReply: true, // Use faster delay for agent replies
    });

    if (result.success) {
      // Update message with real channel message ID
      const [updatedMessage] = await db
        .update(messages)
        .set({
          channelMessageId: result.messageId || channelMessageId,
          status: 'sent',
        })
        .where(eq(messages.id, pendingMessage!.id))
        .returning();

      // Update conversation
      await updateConversationOnNewMessage(conversationId, false);

      // Broadcast to other agents
      broadcastNewMessage(accountId, {
        accountId,
        conversationId,
        channelType: conversation.channelType,
        message: {
          id: updatedMessage!.id,
          tempId,
          senderType: 'agent',
          contentType,
          content,
          mediaUrl,
          timestamp: updatedMessage!.createdAt.toISOString(),
          status: 'sent',
          senderName: null, // Could fetch agent name
        },
        _source: 'other',
      });

      return {
        success: true,
        message: {
          id: updatedMessage!.id,
          conversationId: updatedMessage!.conversationId,
          channelMessageId: updatedMessage!.channelMessageId,
          channelType: updatedMessage!.channelType as ChannelType,
          senderType: 'agent',
          contentType: updatedMessage!.contentType as ContentType,
          content: updatedMessage!.content,
          mediaUrl: updatedMessage!.mediaUrl,
          mediaMimeType: updatedMessage!.mediaMimeType,
          status: 'sent',
          agentId: updatedMessage!.agentId,
          isAutoReply: false,
          senderName: null,
          reactions: [],
          isEdited: false,
          quotedContent: null,
          quotedSenderName: null,
          createdAt: updatedMessage!.createdAt,
        },
      };
    } else {
      // Update message status to failed
      await db
        .update(messages)
        .set({ status: 'failed' })
        .where(eq(messages.id, pendingMessage!.id));

      broadcastMessageStatus(accountId, {
        messageId: pendingMessage!.id,
        status: 'failed',
        error: result.error,
      });

      return { success: false, error: result.error };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Messages] Send error:', error);
    return { success: false, error: message };
  }
}

/**
 * Get a single message by ID
 */
export async function getMessageById(messageId: string): Promise<MessageWithSender | null> {
  const result = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });

  if (!result) return null;

  return {
    id: result.id,
    conversationId: result.conversationId,
    channelMessageId: result.channelMessageId,
    channelType: result.channelType as ChannelType,
    senderType: result.senderType as 'agent' | 'contact' | 'system',
    contentType: result.contentType as ContentType,
    content: result.content,
    mediaUrl: result.mediaUrl,
    mediaMimeType: result.mediaMimeType,
    status: result.status as MessageStatus,
    agentId: result.agentId,
    isAutoReply: result.isAutoReply,
    senderName: result.senderName,
    reactions: (result.reactions as unknown[]) || [],
    isEdited: result.isEdited,
    quotedContent: result.quotedContent,
    quotedSenderName: result.quotedSenderName,
    createdAt: result.createdAt,
  };
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus
): Promise<boolean> {
  try {
    await db
      .update(messages)
      .set({ status })
      .where(eq(messages.id, messageId));

    return true;
  } catch (error) {
    console.error('[Messages] Update status error:', error);
    return false;
  }
}
