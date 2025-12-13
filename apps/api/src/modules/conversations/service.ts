import { eq, and, desc, sql, isNull, isNotNull } from 'drizzle-orm';
import { db, conversations, contacts, messages, groups } from '../../db/index.js';
import type { ChannelType } from '@chatuncle/shared';

export interface ConversationWithDetails {
  id: string;
  accountId: string;
  channelType: ChannelType;
  isGroup: boolean;
  lastMessageAt: Date | null;
  unreadCount: number;
  assignedAgentId: string | null;
  createdAt: Date;
  contact?: {
    id: string;
    name: string | null;
    phoneNumber: string | null;
    profilePicUrl: string | null;
  };
  group?: {
    id: string;
    name: string;
    participantCount: number;
    profilePicUrl: string | null;
  };
  lastMessage?: {
    id: string;
    contentType: string;
    content: string | null;
    senderType: string;
    createdAt: Date;
  };
}

export interface ConversationListParams {
  accountId: string;
  page?: number;
  limit?: number;
  isGroup?: boolean;
  assignedAgentId?: string;
  unreadOnly?: boolean;
}

export interface UnifiedInboxParams {
  accountIds: string[];
  page?: number;
  limit?: number;
  isGroup?: boolean;
  assignedAgentId?: string;
  unreadOnly?: boolean;
  channelType?: string;
}

/**
 * Get conversations for an account with pagination
 */
export async function getConversations(
  params: ConversationListParams
): Promise<{ conversations: ConversationWithDetails[]; total: number }> {
  const { accountId, page = 1, limit = 50, isGroup, assignedAgentId, unreadOnly } = params;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(conversations.accountId, accountId)];

  if (isGroup !== undefined) {
    conditions.push(eq(conversations.isGroup, isGroup));
  }

  if (assignedAgentId) {
    conditions.push(eq(conversations.assignedAgentId, assignedAgentId));
  }

  if (unreadOnly) {
    conditions.push(sql`${conversations.unreadCount} > 0`);
  }

  // Get conversations with related data
  const results = await db.query.conversations.findMany({
    where: and(...conditions),
    orderBy: [desc(conversations.lastMessageAt), desc(conversations.createdAt)],
    limit,
    offset,
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          phoneNumber: true,
          profilePicUrl: true,
        },
      },
      group: {
        columns: {
          id: true,
          name: true,
          participantCount: true,
          profilePicUrl: true,
        },
      },
    },
  });

  // Get last message for each conversation
  const conversationIds = results.map(c => c.id);
  const lastMessages = conversationIds.length > 0
    ? await db
        .select({
          conversationId: messages.conversationId,
          id: messages.id,
          contentType: messages.contentType,
          content: messages.content,
          senderType: messages.senderType,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(sql`${messages.conversationId} IN ${conversationIds}`)
        .orderBy(desc(messages.createdAt))
        .limit(conversationIds.length)
    : [];

  const lastMessageMap = new Map(
    lastMessages.map(m => [m.conversationId, m])
  );

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(...conditions));

  const conversationsWithDetails: ConversationWithDetails[] = results.map(c => ({
    id: c.id,
    accountId: c.accountId,
    channelType: c.channelType as ChannelType,
    isGroup: c.isGroup,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    assignedAgentId: c.assignedAgentId,
    createdAt: c.createdAt,
    contact: c.contact ? {
      id: c.contact.id,
      name: c.contact.name,
      phoneNumber: c.contact.phoneNumber,
      profilePicUrl: c.contact.profilePicUrl,
    } : undefined,
    group: c.group ? {
      id: c.group.id,
      name: c.group.name,
      participantCount: c.group.participantCount,
      profilePicUrl: c.group.profilePicUrl,
    } : undefined,
    lastMessage: lastMessageMap.get(c.id) ? {
      id: lastMessageMap.get(c.id)!.id,
      contentType: lastMessageMap.get(c.id)!.contentType,
      content: lastMessageMap.get(c.id)!.content,
      senderType: lastMessageMap.get(c.id)!.senderType,
      createdAt: lastMessageMap.get(c.id)!.createdAt,
    } : undefined,
  }));

  return {
    conversations: conversationsWithDetails,
    total: count,
  };
}

/**
 * Get conversations across all accounts (unified inbox)
 */
export async function getUnifiedInbox(
  params: UnifiedInboxParams
): Promise<{ conversations: (ConversationWithDetails & { accountName?: string })[]; total: number }> {
  const { accountIds, page = 1, limit = 50, isGroup, assignedAgentId, unreadOnly, channelType } = params;
  const offset = (page - 1) * limit;

  if (accountIds.length === 0) {
    return { conversations: [], total: 0 };
  }

  // Build where conditions
  const conditions = [sql`${conversations.accountId} IN ${accountIds}`];

  if (isGroup !== undefined) {
    conditions.push(eq(conversations.isGroup, isGroup));
  }

  if (assignedAgentId) {
    conditions.push(eq(conversations.assignedAgentId, assignedAgentId));
  }

  if (unreadOnly) {
    conditions.push(sql`${conversations.unreadCount} > 0`);
  }

  if (channelType) {
    conditions.push(eq(conversations.channelType, channelType));
  }

  // Get conversations with related data
  const results = await db.query.conversations.findMany({
    where: and(...conditions),
    orderBy: [desc(conversations.lastMessageAt), desc(conversations.createdAt)],
    limit,
    offset,
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          phoneNumber: true,
          profilePicUrl: true,
        },
      },
      group: {
        columns: {
          id: true,
          name: true,
          participantCount: true,
          profilePicUrl: true,
        },
      },
      account: {
        columns: {
          id: true,
          channelIdentifier: true,
          phoneNumber: true,
          channelType: true,
        },
      },
    },
  });

  // Get last message for each conversation
  const conversationIds = results.map(c => c.id);
  const lastMessages = conversationIds.length > 0
    ? await db
        .select({
          conversationId: messages.conversationId,
          id: messages.id,
          contentType: messages.contentType,
          content: messages.content,
          senderType: messages.senderType,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(sql`${messages.conversationId} IN ${conversationIds}`)
        .orderBy(desc(messages.createdAt))
        .limit(conversationIds.length)
    : [];

  const lastMessageMap = new Map(
    lastMessages.map(m => [m.conversationId, m])
  );

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(...conditions));

  const conversationsWithDetails = results.map((c: any) => ({
    id: c.id,
    accountId: c.accountId,
    accountName: c.account?.channelIdentifier || c.account?.phoneNumber || undefined,
    channelType: c.channelType as ChannelType,
    isGroup: c.isGroup,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    assignedAgentId: c.assignedAgentId,
    createdAt: c.createdAt,
    contact: c.contact ? {
      id: c.contact.id,
      name: c.contact.name,
      phoneNumber: c.contact.phoneNumber,
      profilePicUrl: c.contact.profilePicUrl,
    } : undefined,
    group: c.group ? {
      id: c.group.id,
      name: c.group.name,
      participantCount: c.group.participantCount,
      profilePicUrl: c.group.profilePicUrl,
    } : undefined,
    lastMessage: lastMessageMap.get(c.id) ? {
      id: lastMessageMap.get(c.id)!.id,
      contentType: lastMessageMap.get(c.id)!.contentType,
      content: lastMessageMap.get(c.id)!.content,
      senderType: lastMessageMap.get(c.id)!.senderType,
      createdAt: lastMessageMap.get(c.id)!.createdAt,
    } : undefined,
  }));

  return {
    conversations: conversationsWithDetails,
    total: count,
  };
}

/**
 * Get a single conversation by ID
 */
export async function getConversationById(
  conversationId: string
): Promise<ConversationWithDetails | null> {
  const result = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          phoneNumber: true,
          profilePicUrl: true,
        },
      },
      group: {
        columns: {
          id: true,
          name: true,
          participantCount: true,
          profilePicUrl: true,
        },
      },
    },
  });

  if (!result) return null;

  // Get last message
  const [lastMessage] = await db
    .select({
      id: messages.id,
      contentType: messages.contentType,
      content: messages.content,
      senderType: messages.senderType,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return {
    id: result.id,
    accountId: result.accountId,
    channelType: result.channelType as ChannelType,
    isGroup: result.isGroup,
    lastMessageAt: result.lastMessageAt,
    unreadCount: result.unreadCount,
    assignedAgentId: result.assignedAgentId,
    createdAt: result.createdAt,
    contact: result.contact ? {
      id: result.contact.id,
      name: result.contact.name,
      phoneNumber: result.contact.phoneNumber,
      profilePicUrl: result.contact.profilePicUrl,
    } : undefined,
    group: result.group ? {
      id: result.group.id,
      name: result.group.name,
      participantCount: result.group.participantCount,
      profilePicUrl: result.group.profilePicUrl,
    } : undefined,
    lastMessage: lastMessage ? {
      id: lastMessage.id,
      contentType: lastMessage.contentType,
      content: lastMessage.content,
      senderType: lastMessage.senderType,
      createdAt: lastMessage.createdAt,
    } : undefined,
  };
}

/**
 * Mark conversation as read (reset unread count)
 */
export async function markConversationRead(conversationId: string): Promise<boolean> {
  try {
    await db
      .update(conversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return true;
  } catch (error) {
    console.error('[Conversation] Mark read error:', error);
    return false;
  }
}

/**
 * Assign agent to conversation
 */
export async function assignAgent(
  conversationId: string,
  agentId: string | null
): Promise<boolean> {
  try {
    await db
      .update(conversations)
      .set({
        assignedAgentId: agentId,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    return true;
  } catch (error) {
    console.error('[Conversation] Assign agent error:', error);
    return false;
  }
}

/**
 * Get or create conversation for a contact/group
 */
export async function getOrCreateConversation(params: {
  accountId: string;
  channelType: ChannelType;
  contactId?: string;
  groupId?: string;
  isGroup: boolean;
}): Promise<string> {
  const { accountId, channelType, contactId, groupId, isGroup } = params;

  // Try to find existing
  const conditions = [eq(conversations.accountId, accountId)];

  if (isGroup && groupId) {
    conditions.push(eq(conversations.groupId, groupId));
  } else if (contactId) {
    conditions.push(eq(conversations.contactId, contactId));
  }

  const existing = await db.query.conversations.findFirst({
    where: and(...conditions),
  });

  if (existing) return existing.id;

  // Create new
  const [created] = await db
    .insert(conversations)
    .values({
      accountId,
      channelType,
      contactId: isGroup ? null : contactId,
      groupId: isGroup ? groupId : null,
      isGroup,
    })
    .returning();

  return created!.id;
}

/**
 * Update conversation last message time and increment unread
 */
export async function updateConversationOnNewMessage(
  conversationId: string,
  fromContact: boolean
): Promise<void> {
  const updateData = fromContact
    ? {
        lastMessageAt: new Date(),
        unreadCount: sql`${conversations.unreadCount} + 1`,
        updatedAt: new Date(),
      }
    : {
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      };

  await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.id, conversationId));
}
