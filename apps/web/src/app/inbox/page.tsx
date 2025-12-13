'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore, Conversation } from '@/stores/conversations';
import { useMessagesStore, Message } from '@/stores/messages';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket, joinAccounts, leaveAccounts } from '@/lib/socket';
import { MessageThread } from '@/components/chat/MessageThread';
import { MessageInput } from '@/components/chat/MessageInput';
import { Inbox, Settings, RefreshCw, Filter, Users, MessageSquare } from 'lucide-react';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { ChannelType, NewMessageEvent, MessageStatusEvent, AccountStatusEvent } from '@chatuncle/shared';

interface Account {
  id: string;
  channelType: ChannelType;
  status: string;
  name: string | null;
  phoneNumber: string | null;
}

type FilterType = 'all' | 'unread' | 'assigned';

export default function UnifiedInboxPage() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuthStore();
  const {
    conversations,
    selectedId,
    isLoading,
    loadInbox,
    selectConversation,
    updateLastMessage,
    incrementUnread,
    resetUnread,
    addConversation,
    clear: clearConversations,
  } = useConversationsStore();
  const {
    messagesByConversation,
    loadMessages,
    addMessage,
    updateMessageStatus,
    addPendingMessage,
    confirmPendingMessage,
    clear: clearMessages,
  } = useMessagesStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Load accounts and inbox
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
      return;
    }

    if (token) {
      loadAccountsAndInbox();
    }
  }, [token, authLoading]);

  // Initialize socket connection for all accounts
  useEffect(() => {
    if (!token || accounts.length === 0) return;

    const socket = connectSocket(token);
    const accountIds = accounts.map(a => a.id);
    joinAccounts(accountIds);

    // Listen for events
    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleMessageStatus);
    socket.on('account:status', handleAccountStatus);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleMessageStatus);
      socket.off('account:status', handleAccountStatus);
      leaveAccounts(accountIds);
    };
  }, [token, accounts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearConversations();
      clearMessages();
    };
  }, []);

  // Reload when filters change
  useEffect(() => {
    if (token) {
      loadInboxWithFilters();
    }
  }, [filter, channelFilter]);

  const loadAccountsAndInbox = async () => {
    try {
      const { accounts: loadedAccounts } = await api.getAccounts();
      setAccounts(loadedAccounts);
      await loadInboxWithFilters();
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadInboxWithFilters = async () => {
    const filters: any = {};
    if (filter === 'unread') filters.unreadOnly = true;
    if (filter === 'assigned' && user) filters.assignedAgentId = user.id;
    if (channelFilter) filters.channelType = channelFilter;
    await loadInbox(filters, true);
  };

  const handleNewMessage = useCallback((event: NewMessageEvent) => {
    // Check if this account is in our list
    if (!accounts.find(a => a.id === event.accountId)) return;

    const message: Message = {
      id: event.message.id,
      conversationId: event.conversationId,
      channelMessageId: event.message.id,
      senderType: event.message.senderType as 'agent' | 'contact' | 'system',
      contentType: event.message.contentType,
      content: event.message.content || null,
      mediaUrl: event.message.mediaUrl || null,
      mediaMimeType: null,
      status: event.message.status,
      agentId: null,
      isAutoReply: false,
      senderName: event.message.senderName || null,
      reactions: [],
      isEdited: false,
      quotedContent: null,
      quotedSenderName: null,
      createdAt: event.message.timestamp,
    };

    // Handle pending message confirmation
    if (event.message.tempId) {
      confirmPendingMessage(event.conversationId, event.message.tempId, message);
    } else {
      const added = addMessage(message);
      if (added && message.senderType === 'contact') {
        incrementUnread(event.conversationId);
      }
    }

    // Update conversation last message
    updateLastMessage(event.conversationId, {
      id: message.id,
      contentType: message.contentType,
      content: message.content,
      senderType: message.senderType,
      createdAt: message.createdAt,
    });

    // If conversation doesn't exist yet, reload inbox
    if (!conversations.has(event.conversationId)) {
      loadInboxWithFilters();
    }
  }, [accounts, conversations, addMessage, confirmPendingMessage, incrementUnread, updateLastMessage]);

  const handleMessageStatus = useCallback((event: MessageStatusEvent) => {
    messagesByConversation.forEach((messages, convId) => {
      if (messages.has(event.messageId)) {
        updateMessageStatus(convId, event.messageId, event.status);
      }
    });
  }, [messagesByConversation, updateMessageStatus]);

  const handleAccountStatus = useCallback((event: AccountStatusEvent) => {
    setAccounts(prev => prev.map(a =>
      a.id === event.accountId ? { ...a, status: event.status } : a
    ));
  }, []);

  const handleSelectConversation = async (conversationId: string) => {
    selectConversation(conversationId);
    resetUnread(conversationId);

    if (!messagesByConversation.has(conversationId)) {
      await loadMessages(conversationId, true);
    }

    try {
      await api.markConversationRead(conversationId);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleSendMessage = async (content: string, contentType: string = 'text') => {
    if (!selectedId) return;

    const tempId = `temp-${Date.now()}`;
    const pendingMessage: Message = {
      id: tempId,
      conversationId: selectedId,
      channelMessageId: tempId,
      senderType: 'agent',
      contentType: contentType as Message['contentType'],
      content,
      mediaUrl: null,
      mediaMimeType: null,
      status: 'pending',
      agentId: null,
      isAutoReply: false,
      senderName: null,
      reactions: [],
      isEdited: false,
      quotedContent: null,
      quotedSenderName: null,
      createdAt: new Date().toISOString(),
      tempId,
      isPending: true,
    };

    addPendingMessage(selectedId, pendingMessage);

    try {
      await api.sendMessage(selectedId, {
        contentType,
        content,
        tempId,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      updateMessageStatus(selectedId, tempId, 'failed');
    }
  };

  const selectedConversation = selectedId ? conversations.get(selectedId) : null;
  const currentMessages = selectedId ? messagesByConversation.get(selectedId) : null;
  const messagesArray = currentMessages ? Array.from(currentMessages.values()) : [];
  messagesArray.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Get sorted conversations
  const sortedConversations = Array.from(conversations.values()).sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  // Stats
  const totalUnread = sortedConversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const connectedAccounts = accounts.filter(a => a.status === 'connected').length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Inbox className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Unified Inbox</h1>
            <p className="text-xs text-gray-500">
              {connectedAccounts} connected account{connectedAccounts !== 1 ? 's' : ''}
              {totalUnread > 0 && ` • ${totalUnread} unread`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'p-2 rounded-md transition-colors',
              showFilters ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
            title="Filters"
          >
            <Filter className="h-5 w-5" />
          </button>
          <button
            onClick={() => loadInboxWithFilters()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Status:</span>
            <div className="flex gap-1">
              {(['all', 'unread', 'assigned'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-full transition-colors capitalize',
                    filter === f
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {f === 'assigned' ? 'My Chats' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Channel:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setChannelFilter(null)}
                className={clsx(
                  'px-3 py-1 text-sm rounded-full transition-colors',
                  !channelFilter
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                All
              </button>
              {['whatsapp', 'telegram', 'instagram', 'messenger'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={clsx(
                    'px-2 py-1 rounded-full transition-colors flex items-center gap-1',
                    channelFilter === ch
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <ChannelIcon type={ch as ChannelType} size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-96 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : sortedConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No conversations yet</p>
              <p className="text-gray-400 text-xs mt-1">Messages will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedConversations.map((conversation) => (
                <InboxConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === selectedId}
                  onSelect={() => handleSelectConversation(conversation.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Message Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <ChannelIcon type={selectedConversation.channelType} size={20} />
                  <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded">
                    {selectedConversation.accountName || selectedConversation.channelType}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {selectedConversation.isGroup
                      ? selectedConversation.group?.name
                      : selectedConversation.contact?.name || selectedConversation.contact?.phoneNumber}
                  </p>
                  {selectedConversation.isGroup && (
                    <p className="text-xs text-gray-500">
                      {selectedConversation.group?.participantCount} participants
                    </p>
                  )}
                </div>
              </div>
              <MessageThread messages={messagesArray} />
              <MessageInput onSend={handleSendMessage} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <Inbox className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-lg font-medium text-gray-600">Unified Inbox</p>
              <p className="text-sm text-gray-400 mt-1">Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Conversation Item Component for Inbox
function InboxConversationItem({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const name = conversation.isGroup
    ? conversation.group?.name
    : conversation.contact?.name || conversation.contact?.phoneNumber || 'Unknown';

  const profilePic = conversation.isGroup
    ? conversation.group?.profilePicUrl
    : conversation.contact?.profilePicUrl;

  const lastMessage = conversation.lastMessage;
  const lastMessagePreview = lastMessage
    ? lastMessage.contentType === 'text'
      ? lastMessage.content || ''
      : `[${lastMessage.contentType}]`
    : '';

  const timeAgo = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
    : '';

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left',
        isSelected && 'bg-primary-50 hover:bg-primary-50'
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative">
        {profilePic ? (
          <img src={profilePic} alt={name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
            {name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5">
          <ChannelIcon type={conversation.channelType} size={16} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-gray-900 truncate">{name}</p>
          {timeAgo && <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo}</span>}
        </div>
        {conversation.accountName && (
          <p className="text-xs text-gray-400 truncate">{conversation.accountName}</p>
        )}
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-gray-500 truncate">{lastMessagePreview}</p>
          {conversation.unreadCount > 0 && (
            <span className="ml-2 flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary-600 text-white text-xs font-medium">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
