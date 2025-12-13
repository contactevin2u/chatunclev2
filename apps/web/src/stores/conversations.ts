import { create } from 'zustand';
import { api } from '@/lib/api';
import type { ChannelType } from '@chatuncle/shared';

interface Contact {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  profilePicUrl: string | null;
}

interface Group {
  id: string;
  name: string;
  participantCount: number;
  profilePicUrl: string | null;
}

interface LastMessage {
  id: string;
  contentType: string;
  content: string | null;
  senderType: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  accountId: string;
  accountName?: string;
  channelType: ChannelType;
  isGroup: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
  assignedAgentId: string | null;
  assignedAgentName?: string | null;
  createdAt: string;
  contact?: Contact;
  group?: Group;
  lastMessage?: LastMessage;
}

interface InboxFilters {
  isGroup?: boolean;
  unreadOnly?: boolean;
  channelType?: string;
  assignedAgentId?: string;
}

interface ConversationsState {
  conversations: Map<string, Conversation>;
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  total: number;
  page: number;
  hasMore: boolean;

  loadConversations: (accountId: string, reset?: boolean) => Promise<void>;
  loadInbox: (filters?: InboxFilters, reset?: boolean) => Promise<void>;
  selectConversation: (conversationId: string | null) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  updateLastMessage: (conversationId: string, message: LastMessage) => void;
  incrementUnread: (conversationId: string) => void;
  resetUnread: (conversationId: string) => void;
  addConversation: (conversation: Conversation) => void;
  clear: () => void;
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: new Map(),
  selectedId: null,
  isLoading: false,
  error: null,
  total: 0,
  page: 1,
  hasMore: true,

  loadConversations: async (accountId: string, reset = false) => {
    const { page, conversations: existingConversations } = get();
    const currentPage = reset ? 1 : page;

    set({ isLoading: true, error: null });

    try {
      const { conversations, total, totalPages } = await api.getConversations(accountId, {
        page: currentPage,
        limit: 50,
      });

      const newConversations = reset ? new Map() : new Map(existingConversations);

      conversations.forEach((conv: Conversation) => {
        newConversations.set(conv.id, conv);
      });

      set({
        conversations: newConversations,
        total,
        page: currentPage + 1,
        hasMore: currentPage < totalPages,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load conversations';
      set({ error: message, isLoading: false });
    }
  },

  loadInbox: async (filters?: InboxFilters, reset = false) => {
    const { page, conversations: existingConversations } = get();
    const currentPage = reset ? 1 : page;

    set({ isLoading: true, error: null });

    try {
      const { conversations, total, totalPages } = await api.getInbox({
        page: currentPage,
        limit: 50,
        ...filters,
      });

      const newConversations = reset ? new Map() : new Map(existingConversations);

      conversations.forEach((conv: Conversation) => {
        newConversations.set(conv.id, conv);
      });

      set({
        conversations: newConversations,
        total,
        page: currentPage + 1,
        hasMore: currentPage < totalPages,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load inbox';
      set({ error: message, isLoading: false });
    }
  },

  selectConversation: (conversationId: string | null) => {
    set({ selectedId: conversationId });
  },

  updateConversation: (conversationId: string, updates: Partial<Conversation>) => {
    const { conversations } = get();
    const existing = conversations.get(conversationId);

    if (existing) {
      const updated = new Map(conversations);
      updated.set(conversationId, { ...existing, ...updates });
      set({ conversations: updated });
    }
  },

  updateLastMessage: (conversationId: string, message: LastMessage) => {
    const { conversations } = get();
    const existing = conversations.get(conversationId);

    if (existing) {
      const updated = new Map(conversations);
      updated.set(conversationId, {
        ...existing,
        lastMessage: message,
        lastMessageAt: message.createdAt,
      });
      set({ conversations: updated });
    }
  },

  incrementUnread: (conversationId: string) => {
    const { conversations, selectedId } = get();

    // Don't increment if conversation is selected
    if (conversationId === selectedId) return;

    const existing = conversations.get(conversationId);
    if (existing) {
      const updated = new Map(conversations);
      updated.set(conversationId, {
        ...existing,
        unreadCount: existing.unreadCount + 1,
      });
      set({ conversations: updated });
    }
  },

  resetUnread: (conversationId: string) => {
    const { conversations } = get();
    const existing = conversations.get(conversationId);

    if (existing && existing.unreadCount > 0) {
      const updated = new Map(conversations);
      updated.set(conversationId, { ...existing, unreadCount: 0 });
      set({ conversations: updated });
    }
  },

  addConversation: (conversation: Conversation) => {
    const { conversations } = get();
    const updated = new Map(conversations);
    updated.set(conversation.id, conversation);
    set({ conversations: updated });
  },

  clear: () => {
    set({
      conversations: new Map(),
      selectedId: null,
      isLoading: false,
      error: null,
      total: 0,
      page: 1,
      hasMore: true,
    });
  },
}));
