import { create } from 'zustand';
import { api } from '@/lib/api';
import type { ContentType, MessageStatus } from '@chatuncle/shared';

export interface Message {
  id: string;
  conversationId: string;
  channelMessageId: string;
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
  createdAt: string;
  tempId?: string;
  isPending?: boolean;
}

interface MessagesState {
  messagesByConversation: Map<string, Map<string, Message>>;
  seenMessageIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  hasMore: Map<string, boolean>;

  loadMessages: (conversationId: string, reset?: boolean) => Promise<void>;
  addMessage: (message: Message) => boolean; // Returns false if duplicate
  updateMessageStatus: (conversationId: string, messageId: string, status: MessageStatus) => void;
  addPendingMessage: (conversationId: string, message: Message) => void;
  confirmPendingMessage: (conversationId: string, tempId: string, confirmedMessage: Message) => void;
  clear: () => void;
  clearConversation: (conversationId: string) => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByConversation: new Map(),
  seenMessageIds: new Set(),
  isLoading: false,
  error: null,
  hasMore: new Map(),

  loadMessages: async (conversationId: string, reset = false) => {
    const { messagesByConversation } = get();
    const existingMessages = messagesByConversation.get(conversationId);

    set({ isLoading: true, error: null });

    try {
      // Get oldest message ID for pagination
      let before: string | undefined;
      if (!reset && existingMessages && existingMessages.size > 0) {
        const messages = Array.from(existingMessages.values());
        messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        before = messages[0].id;
      }

      const { messages, hasMore } = await api.getMessages(conversationId, {
        limit: 50,
        before,
      });

      const { seenMessageIds } = get();
      const newConversationMessages = reset
        ? new Map<string, Message>()
        : new Map(existingMessages || new Map());

      const newSeenIds = new Set(seenMessageIds);

      messages.forEach((msg: Message) => {
        if (!newSeenIds.has(msg.id)) {
          newConversationMessages.set(msg.id, msg);
          newSeenIds.add(msg.id);
        }
      });

      const updatedMap = new Map(messagesByConversation);
      updatedMap.set(conversationId, newConversationMessages);

      const updatedHasMore = new Map(get().hasMore);
      updatedHasMore.set(conversationId, hasMore);

      set({
        messagesByConversation: updatedMap,
        seenMessageIds: newSeenIds,
        hasMore: updatedHasMore,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load messages';
      set({ error: message, isLoading: false });
    }
  },

  addMessage: (message: Message) => {
    const { messagesByConversation, seenMessageIds } = get();

    // Deduplication check
    if (seenMessageIds.has(message.id)) {
      return false;
    }

    const conversationMessages = messagesByConversation.get(message.conversationId) || new Map();
    const updatedConversationMessages = new Map(conversationMessages);
    updatedConversationMessages.set(message.id, message);

    const updatedMap = new Map(messagesByConversation);
    updatedMap.set(message.conversationId, updatedConversationMessages);

    const updatedSeenIds = new Set(seenMessageIds);
    updatedSeenIds.add(message.id);

    set({
      messagesByConversation: updatedMap,
      seenMessageIds: updatedSeenIds,
    });

    return true;
  },

  updateMessageStatus: (conversationId: string, messageId: string, status: MessageStatus) => {
    const { messagesByConversation } = get();
    const conversationMessages = messagesByConversation.get(conversationId);

    if (conversationMessages) {
      const message = conversationMessages.get(messageId);
      if (message) {
        const updatedConversationMessages = new Map(conversationMessages);
        updatedConversationMessages.set(messageId, { ...message, status });

        const updatedMap = new Map(messagesByConversation);
        updatedMap.set(conversationId, updatedConversationMessages);

        set({ messagesByConversation: updatedMap });
      }
    }
  },

  addPendingMessage: (conversationId: string, message: Message) => {
    const { messagesByConversation, seenMessageIds } = get();

    const conversationMessages = messagesByConversation.get(conversationId) || new Map();
    const updatedConversationMessages = new Map(conversationMessages);
    updatedConversationMessages.set(message.id, { ...message, isPending: true });

    const updatedMap = new Map(messagesByConversation);
    updatedMap.set(conversationId, updatedConversationMessages);

    const updatedSeenIds = new Set(seenMessageIds);
    updatedSeenIds.add(message.id);

    set({
      messagesByConversation: updatedMap,
      seenMessageIds: updatedSeenIds,
    });
  },

  confirmPendingMessage: (conversationId: string, tempId: string, confirmedMessage: Message) => {
    const { messagesByConversation, seenMessageIds } = get();
    const conversationMessages = messagesByConversation.get(conversationId);

    if (conversationMessages) {
      const updatedConversationMessages = new Map(conversationMessages);

      // Remove pending message
      updatedConversationMessages.delete(tempId);

      // Add confirmed message
      updatedConversationMessages.set(confirmedMessage.id, confirmedMessage);

      const updatedMap = new Map(messagesByConversation);
      updatedMap.set(conversationId, updatedConversationMessages);

      const updatedSeenIds = new Set(seenMessageIds);
      updatedSeenIds.delete(tempId);
      updatedSeenIds.add(confirmedMessage.id);

      set({
        messagesByConversation: updatedMap,
        seenMessageIds: updatedSeenIds,
      });
    }
  },

  clear: () => {
    set({
      messagesByConversation: new Map(),
      seenMessageIds: new Set(),
      isLoading: false,
      error: null,
      hasMore: new Map(),
    });
  },

  clearConversation: (conversationId: string) => {
    const { messagesByConversation, seenMessageIds, hasMore } = get();

    const conversationMessages = messagesByConversation.get(conversationId);
    if (conversationMessages) {
      const updatedSeenIds = new Set(seenMessageIds);
      conversationMessages.forEach((_, id) => updatedSeenIds.delete(id));

      const updatedMap = new Map(messagesByConversation);
      updatedMap.delete(conversationId);

      const updatedHasMore = new Map(hasMore);
      updatedHasMore.delete(conversationId);

      set({
        messagesByConversation: updatedMap,
        seenMessageIds: updatedSeenIds,
        hasMore: updatedHasMore,
      });
    }
  },
}));
