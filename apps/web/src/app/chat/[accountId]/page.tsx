'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore, Conversation } from '@/stores/conversations';
import { useMessagesStore, Message } from '@/stores/messages';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket, joinAccount, leaveAccount } from '@/lib/socket';
import { ConversationList } from '@/components/chat/ConversationList';
import { MessageThread } from '@/components/chat/MessageThread';
import { MessageInput } from '@/components/chat/MessageInput';
import { ArrowLeft, Settings, RefreshCw, QrCode } from 'lucide-react';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import type { ChannelType, NewMessageEvent, MessageStatusEvent, AccountStatusEvent } from '@chatuncle/shared';

interface Account {
  id: string;
  channelType: ChannelType;
  status: string;
  profileName: string | null;
  phoneNumber: string | null;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;

  const { token, isLoading: authLoading } = useAuthStore();
  const {
    conversations,
    selectedId,
    loadConversations,
    selectConversation,
    updateLastMessage,
    incrementUnread,
    resetUnread,
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

  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  // Load account data
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
      return;
    }

    if (token && accountId) {
      loadAccount();
    }
  }, [token, authLoading, accountId]);

  // Initialize socket connection
  useEffect(() => {
    if (!token || !accountId) return;

    const socket = connectSocket(token);
    joinAccount(accountId);

    // Listen for new messages
    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleMessageStatus);
    socket.on('account:status', handleAccountStatus);
    socket.on('qr:update', handleQrUpdate);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleMessageStatus);
      socket.off('account:status', handleAccountStatus);
      socket.off('qr:update', handleQrUpdate);
      leaveAccount(accountId);
    };
  }, [token, accountId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearConversations();
      clearMessages();
    };
  }, []);

  const loadAccount = async () => {
    try {
      const { account } = await api.getAccount(accountId);
      setAccount(account);
      await loadConversations(accountId, true);
    } catch (error) {
      console.error('Failed to load account:', error);
      router.replace('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewMessage = useCallback((event: NewMessageEvent) => {
    if (event.accountId !== accountId) return;

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
  }, [accountId, addMessage, confirmPendingMessage, incrementUnread, updateLastMessage]);

  const handleMessageStatus = useCallback((event: MessageStatusEvent) => {
    // Find conversation for this message
    messagesByConversation.forEach((messages, convId) => {
      if (messages.has(event.messageId)) {
        updateMessageStatus(convId, event.messageId, event.status);
      }
    });
  }, [messagesByConversation, updateMessageStatus]);

  const handleAccountStatus = useCallback((event: AccountStatusEvent) => {
    if (event.accountId === accountId) {
      setAccount((prev) => prev ? { ...prev, status: event.status } : null);
      if (event.status === 'connected') {
        setShowQR(false);
        setQrCode(null);
        setPairingCode(null);
      }
    }
  }, [accountId]);

  const handleQrUpdate = useCallback((data: { accountId: string; qrCode: string }) => {
    if (data.accountId === accountId) {
      setQrCode(data.qrCode);
    }
  }, [accountId]);

  const handleConnect = async () => {
    try {
      const result = await api.connectAccount(accountId);
      if (result.qrCode) {
        setQrCode(result.qrCode);
      }
      if (result.pairingCode) {
        setPairingCode(result.pairingCode);
      }
      setShowQR(true);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    selectConversation(conversationId);
    resetUnread(conversationId);

    // Load messages if not already loaded
    if (!messagesByConversation.has(conversationId)) {
      await loadMessages(conversationId, true);
    }

    // Mark as read on server
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

  if (authLoading || isLoading) {
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
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {account && (
            <>
              <ChannelIcon type={account.channelType} size={32} />
              <div>
                <p className="font-medium text-gray-900">
                  {account.profileName || account.phoneNumber || account.channelType}
                </p>
                <p className="text-xs text-gray-500 capitalize">{account.status}</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {account?.status !== 'connected' && (
            <button
              onClick={handleConnect}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              <QrCode className="h-4 w-4 mr-1" />
              Connect
            </button>
          )}
          <button
            onClick={() => loadConversations(accountId, true)}
            className="text-gray-500 hover:text-gray-700"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0">
          <ConversationList
            conversations={Array.from(conversations.values())}
            selectedId={selectedId}
            onSelect={handleSelectConversation}
          />
        </div>

        {/* Message Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              <div className="bg-white border-b border-gray-200 px-4 py-3">
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
              <MessageThread messages={messagesArray} />
              <MessageInput onSend={handleSendMessage} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">Connect WhatsApp</h3>
            {qrCode ? (
              <div className="flex flex-col items-center">
                <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Scan this QR code with WhatsApp on your phone
                </p>
              </div>
            ) : pairingCode ? (
              <div className="text-center">
                <p className="text-3xl font-mono font-bold tracking-wider">{pairingCode}</p>
                <p className="mt-4 text-sm text-gray-600">
                  Enter this code in WhatsApp on your phone
                </p>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            )}
            <button
              onClick={() => setShowQR(false)}
              className="mt-6 w-full text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
