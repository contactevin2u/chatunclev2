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
import { ContactPanel } from '@/components/chat/ContactPanel';
import { ArrowLeft, Settings, RefreshCw, QrCode, UserPlus, User, X, Info } from 'lucide-react';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import type { ChannelType, NewMessageEvent, MessageStatusEvent, AccountStatusEvent } from '@chatuncle/shared';

interface Account {
  id: string;
  channelType: ChannelType;
  status: string;
  profileName: string | null;
  phoneNumber: string | null;
}

interface Agent {
  agentId: string;
  agentName: string;
  agentEmail: string;
  role: 'owner' | 'admin' | 'agent';
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;

  const { token, user, isLoading: authLoading } = useAuthStore();
  const {
    conversations,
    selectedId,
    loadConversations,
    selectConversation,
    updateConversation,
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);

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
      // Load agents for this account
      try {
        const { agents: accountAgents } = await api.getAccountAgents(accountId);
        setAgents(accountAgents);
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    } catch (error) {
      console.error('Failed to load account:', error);
      router.replace('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignConversation = async (agentId: string | null) => {
    if (!selectedId) return;
    try {
      await api.assignConversation(selectedId, agentId);
      // Update local state using store function
      updateConversation(selectedId, {
        assignedAgentId: agentId,
        assignedAgentName: agentId
          ? agents.find((a) => a.agentId === agentId)?.agentName || null
          : null,
      });
      setShowAssignDropdown(false);
    } catch (error) {
      console.error('Failed to assign conversation:', error);
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
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
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

                <div className="flex items-center gap-2">
                  {/* Contact Info Button (only for 1:1 chats) */}
                  {!selectedConversation.isGroup && selectedConversation.contact && (
                    <button
                      onClick={() => setShowContactPanel(!showContactPanel)}
                      className={`p-2 rounded-md hover:bg-gray-100 ${
                        showContactPanel ? 'bg-gray-100 text-primary-600' : 'text-gray-500'
                      }`}
                      title="Contact details"
                    >
                      <Info className="h-5 w-5" />
                    </button>
                  )}

                  {/* Agent Assignment */}
                <div className="relative">
                  <button
                    onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {selectedConversation.assignedAgentId ? (
                      <>
                        <User className="h-4 w-4 text-primary-600" />
                        <span className="text-gray-700">{selectedConversation.assignedAgentName || 'Assigned'}</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-500">Assign</span>
                      </>
                    )}
                  </button>

                  {showAssignDropdown && (
                    <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                      <div className="py-1">
                        {selectedConversation.assignedAgentId && (
                          <button
                            onClick={() => handleAssignConversation(null)}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <X className="h-4 w-4" />
                            Unassign
                          </button>
                        )}
                        {agents.map((agent) => (
                          <button
                            key={agent.agentId}
                            onClick={() => handleAssignConversation(agent.agentId)}
                            className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                              selectedConversation.assignedAgentId === agent.agentId
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-700'
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                              {agent.agentName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{agent.agentName}</p>
                              <p className="text-xs text-gray-500 truncate">{agent.agentEmail}</p>
                            </div>
                            {selectedConversation.assignedAgentId === agent.agentId && (
                              <span className="text-primary-600">✓</span>
                            )}
                          </button>
                        ))}
                        {agents.length === 0 && (
                          <p className="px-4 py-2 text-sm text-gray-500">No team members</p>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col">
                  <MessageThread messages={messagesArray} />
                  <MessageInput onSend={handleSendMessage} />
                </div>

                {/* Contact Panel */}
                {showContactPanel && !selectedConversation.isGroup && selectedConversation.contact && (
                  <ContactPanel
                    contact={selectedConversation.contact}
                    accountId={accountId}
                    currentUserId={user?.id || ''}
                    onClose={() => setShowContactPanel(false)}
                  />
                )}
              </div>
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
