'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { conversations as conversationsApi, messages as messagesApi, labels as labelsApi, contacts as contactsApi } from '@/lib/api';
import { Conversation, Message, Label, GroupAccount } from '@/types';
import ConversationList from '@/components/chat/ConversationList';
import MessageThread from '@/components/chat/MessageThread';
import MessageInput from '@/components/chat/MessageInput';
import InternalNotes from '@/components/chat/InternalNotes';
import OrdersPanel from '@/components/chat/OrdersPanel';
import { MessageSquare, RefreshCw, StickyNote, Tag, Plus, X, Check, Edit2, User, Search, Filter, ArrowLeft, Users, ChevronDown, Package } from 'lucide-react';
import MobileBottomNav from '@/components/ui/MobileBottomNav';
import AchievementToast from '@/components/ui/AchievementToast';

export default function InboxPage() {
  const { token } = useAuth();
  const [conversationsList, setConversationsList] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  // For unified groups, track the actual conversation ID to use (for messages/sending)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [newAchievements, setNewAchievements] = useState<any[]>([]);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  // Load labels on mount
  useEffect(() => {
    if (!token) return;
    labelsApi.list(token).then(res => setAllLabels(res.labels || [])).catch(console.error);
  }, [token]);

  // Get contact labels for selected conversation
  const getContactLabels = (): Label[] => {
    return selectedConversation?.labels || [];
  };

  // Add label to contact
  const handleAddLabel = async (labelId: string) => {
    if (!token || !selectedConversation) return;
    try {
      // Find the contact_id from the conversation (we need to get it from backend)
      const convDetails = await conversationsApi.get(token, selectedConversation.id);
      const contactId = convDetails.conversation?.contact_id;
      if (contactId) {
        await contactsApi.addLabel(token, contactId, labelId);
        // Refresh conversations to get updated labels
        loadConversations();
      }
      setShowLabelDropdown(false);
    } catch (error) {
      console.error('Failed to add label:', error);
    }
  };

  // Remove label from contact
  const handleRemoveLabel = async (labelId: string) => {
    if (!token || !selectedConversation) return;
    try {
      const convDetails = await conversationsApi.get(token, selectedConversation.id);
      const contactId = convDetails.conversation?.contact_id;
      if (contactId) {
        await contactsApi.removeLabel(token, contactId, labelId);
        loadConversations();
      }
    } catch (error) {
      console.error('Failed to remove label:', error);
    }
  };

  // Create new label and add to contact
  const handleCreateLabel = async () => {
    if (!token || !selectedConversation || !newLabelName.trim()) return;
    setIsCreatingLabel(true);
    try {
      // Generate a random color
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      // Create the label
      const { label } = await labelsApi.create(token, newLabelName.trim(), randomColor);
      setAllLabels(prev => [...prev, label]);

      // Add it to the contact
      const convDetails = await conversationsApi.get(token, selectedConversation.id);
      const contactId = convDetails.conversation?.contact_id;
      if (contactId) {
        await contactsApi.addLabel(token, contactId, label.id);
        loadConversations();
      }

      setNewLabelName('');
    } catch (error) {
      console.error('Failed to create label:', error);
    } finally {
      setIsCreatingLabel(false);
    }
  };

  // Update contact name
  const handleUpdateContactName = async () => {
    if (!token || !selectedConversation || !editedName.trim()) return;
    try {
      const convDetails = await conversationsApi.get(token, selectedConversation.id);
      const contactId = convDetails.conversation?.contact_id;
      if (contactId) {
        await contactsApi.update(token, contactId, { name: editedName.trim() });
        // Update local state immediately
        setConversationsList(prev => prev.map(conv =>
          conv.id === selectedConversation.id
            ? { ...conv, contact_name: editedName.trim() }
            : conv
        ));
        setSelectedConversation(prev => prev ? { ...prev, contact_name: editedName.trim() } : null);
      }
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update contact name:', error);
    }
  };

  // Start editing contact name
  const startEditingName = () => {
    setEditedName(selectedConversation?.contact_name || selectedConversation?.contact_phone || '');
    setIsEditingName(true);
  };

  // Filter conversations based on search query and label filter
  const filteredConversations = conversationsList.filter(conv => {
    // Search filter - search by name, phone, group name, or last message
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const nameMatch = conv.contact_name?.toLowerCase().includes(query);
      const phoneMatch = conv.contact_phone?.toLowerCase().includes(query);
      const groupNameMatch = conv.group_name?.toLowerCase().includes(query);
      const displayNameMatch = conv.display_name?.toLowerCase().includes(query);
      const messageMatch = conv.last_message?.toLowerCase().includes(query);
      // Also search by label name
      const labelMatch = conv.labels?.some(l => l.name.toLowerCase().includes(query));

      if (!nameMatch && !phoneMatch && !groupNameMatch && !displayNameMatch && !messageMatch && !labelMatch) {
        return false;
      }
    }

    // Label filter (only for 1:1 conversations)
    if (filterLabelId) {
      if (conv.is_group) return false; // Groups don't have labels
      const hasLabel = conv.labels?.some(l => l.id === filterLabelId);
      if (!hasLabel) return false;
    }

    return true;
  });

  // Get active filter label name
  const activeFilterLabel = filterLabelId ? allLabels.find(l => l.id === filterLabelId) : null;

  // Keep refs in sync with state for callbacks
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Get the effective conversation ID (for unified groups, use activeConversationId)
  const getEffectiveConversationId = useCallback(() => {
    if (selectedConversation?.is_unified_group) {
      return activeConversationId || selectedConversation.default_conversation_id;
    }
    return selectedConversation?.id;
  }, [selectedConversation, activeConversationId]);

  // Get the currently selected account for unified groups
  const getSelectedAccount = useCallback((): GroupAccount | null => {
    if (!selectedConversation?.is_unified_group || !selectedConversation.accounts) return null;
    const effectiveId = getEffectiveConversationId();
    return selectedConversation.accounts.find(a => a.conversation_id === effectiveId) || null;
  }, [selectedConversation, getEffectiveConversationId]);

  // Function to reload conversations
  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      // Use unifyGroups=true to merge same groups across accounts
      const { conversations } = await conversationsApi.list(token, { unifyGroups: true });
      setConversationsList(conversations);
      console.log('[UI] Loaded conversations:', conversations.length, '(unified groups enabled)');
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, [token]);

  // Socket event handlers
  const handleNewMessage = useCallback((data: any) => {
    console.log('[UI] New message received:', data);

    // Check if this conversation exists in our list (including unified group accounts)
    let existingConv = conversationsList.find(c => c.id === data.conversationId);

    // Also check unified group accounts
    if (!existingConv) {
      existingConv = conversationsList.find(c =>
        c.is_unified_group && c.accounts?.some(a => a.conversation_id === data.conversationId)
      );
    }

    if (!existingConv) {
      // New conversation - reload the list
      console.log('[UI] New conversation detected, reloading list');
      loadConversations();
      return;
    }

    // Add to messages if current conversation (check effective conversation ID)
    const effectiveId = activeConversationIdRef.current || selectedConversationRef.current?.id;
    if (effectiveId === data.conversationId) {
      setMessagesList((prev) => {
        // Check if message already exists
        if (prev.some(m => m.id === data.message.id)) {
          return prev;
        }
        return [...prev, data.message];
      });
    }

    // Update conversations list
    setConversationsList((prev) => {
      const updated = prev.map((conv) => {
        if (conv.id === data.conversationId) {
          return {
            ...conv,
            last_message: data.message.content,
            last_message_at: data.message.created_at,
            unread_count: selectedConversationRef.current?.id === data.conversationId
              ? conv.unread_count
              : conv.unread_count + 1,
          };
        }
        return conv;
      });

      // Sort by last message time
      return updated.sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTime - aTime;
      });
    });
  }, [conversationsList, loadConversations]);

  // Handle sync progress
  const handleSyncProgress = useCallback((data: any) => {
    console.log('[UI] Sync progress:', data);
    setSyncStatus(`Syncing... ${data.messagesCount} messages`);

    // Reload conversations when sync completes
    if (data.isLatest || data.progress >= 100) {
      setSyncStatus(null);
      loadConversations();
    }
  }, [loadConversations]);

  // Handle message status updates
  const handleMessageStatus = useCallback((data: { messageId: string; status: string }) => {
    console.log('[UI] Message status update:', data);
    setMessagesList((prev) =>
      prev.map((msg) =>
        msg.id === data.messageId
          ? { ...msg, status: data.status as Message['status'] }
          : msg
      )
    );
  }, []);

  // Handle message reaction updates
  const handleMessageReaction = useCallback((data: { messageId: string; waMessageId: string; reactions: any[] }) => {
    console.log('[UI] Message reaction update:', data);
    setMessagesList((prev) =>
      prev.map((msg) =>
        msg.id === data.messageId || msg.wa_message_id === data.waMessageId
          ? { ...msg, reactions: data.reactions }
          : msg
      )
    );
  }, []);

  // Handle achievement notifications
  const handleAchievement = useCallback((data: { achievements: any[] }) => {
    if (data.achievements && data.achievements.length > 0) {
      setNewAchievements(data.achievements);
    }
  }, []);

  useSocket({
    onNewMessage: handleNewMessage,
    onSyncProgress: handleSyncProgress,
    onMessageStatus: handleMessageStatus,
    onMessageReaction: handleMessageReaction,
    onAchievement: handleAchievement,
  });

  // Load conversations on mount
  useEffect(() => {
    if (!token) return;

    const initialLoad = async () => {
      try {
        await loadConversations();
      } finally {
        setIsLoading(false);
      }
    };

    initialLoad();
  }, [token, loadConversations]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!token || !selectedConversation) {
      setMessagesList([]);
      return;
    }

    // Get the effective conversation ID for loading messages
    const effectiveId = selectedConversation.is_unified_group
      ? (activeConversationId || selectedConversation.default_conversation_id)
      : selectedConversation.id;

    if (!effectiveId) {
      setMessagesList([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const { messages } = await messagesApi.list(token, effectiveId);
        setMessagesList(messages);

        // Mark as read
        const unreadCount = selectedConversation.is_unified_group
          ? (selectedConversation.accounts?.find(a => a.conversation_id === effectiveId)?.unread_count || 0)
          : selectedConversation.unread_count;

        if (unreadCount > 0) {
          await conversationsApi.markRead(token, effectiveId);
          // Update conversation list (handle both regular and unified groups)
          setConversationsList((prev) =>
            prev.map((conv) => {
              if (conv.id === selectedConversation.id) {
                if (conv.is_unified_group && conv.accounts) {
                  // Update the specific account's unread count
                  const updatedAccounts = conv.accounts.map(a =>
                    a.conversation_id === effectiveId ? { ...a, unread_count: 0 } : a
                  );
                  const newTotalUnread = updatedAccounts.reduce((sum, a) => sum + a.unread_count, 0);
                  return { ...conv, accounts: updatedAccounts, total_unread: newTotalUnread };
                }
                return { ...conv, unread_count: 0 };
              }
              return conv;
            })
          );
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [token, selectedConversation, activeConversationId]);

  const handleSendMessage = async (content: string, contentType?: string, mediaUrl?: string, mediaMimeType?: string) => {
    if (!token || !selectedConversation) return;
    if (!content.trim() && !mediaUrl) return;

    // Get the effective conversation ID for sending
    const effectiveId = selectedConversation.is_unified_group
      ? (activeConversationId || selectedConversation.default_conversation_id)
      : selectedConversation.id;

    if (!effectiveId) {
      console.error('No effective conversation ID for sending');
      return;
    }

    setIsSending(true);
    try {
      const { message } = await messagesApi.send(token, effectiveId, content, contentType || 'text', mediaUrl, mediaMimeType);
      setMessagesList((prev) => [...prev, message]);

      // Update conversation list
      const displayContent = mediaUrl
        ? (contentType === 'image' ? '📷 Photo' : contentType === 'video' ? '🎥 Video' : contentType === 'audio' ? '🎤 Voice note' : content)
        : content;
      setConversationsList((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversation.id
            ? { ...conv, last_message: displayContent, last_message_at: new Date().toISOString() }
            : conv
        )
      );
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading conversations...</div>
      </div>
    );
  }

  // Handle selecting conversation (show chat on mobile)
  const handleSelectConversation = (conv: Conversation, selectedAccountConversationId?: string) => {
    setSelectedConversation(conv);
    // For unified groups, set the active conversation ID
    if (conv.is_unified_group) {
      setActiveConversationId(selectedAccountConversationId || conv.default_conversation_id || null);
    } else {
      setActiveConversationId(null);
    }
    setMobileShowChat(true);
    setShowAccountSelector(false);
  };

  // Handle switching account within a unified group
  const handleSwitchAccount = (account: GroupAccount) => {
    setActiveConversationId(account.conversation_id);
    setShowAccountSelector(false);
  };

  // Handle back to list on mobile
  const handleBackToList = () => {
    setMobileShowChat(false);
  };

  // Calculate total unread count for mobile nav badge
  const totalUnreadCount = conversationsList.reduce((total, conv) => {
    if (conv.is_unified_group && conv.accounts) {
      return total + (conv.total_unread || 0);
    }
    return total + (conv.unread_count || 0);
  }, 0);

  // Handle inbox click from bottom nav (returns to conversation list)
  const handleMobileInboxClick = () => {
    if (mobileShowChat) {
      setMobileShowChat(false);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Conversations sidebar - hidden on mobile when chat is shown */}
      <div className={`
        w-full md:w-80 lg:w-96
        border-r border-gray-200 bg-white flex flex-col
        transition-transform duration-250 ease-out
        ${mobileShowChat ? 'hidden md:flex' : 'flex'}
        md:pb-0 pb-16
      `}>
        <div className="p-3 md:p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Inbox</h1>
              <p className="text-xs md:text-sm text-gray-500">
                {syncStatus || `${filteredConversations.length} conversations`}
              </p>
            </div>
            <button
              onClick={loadConversations}
              className="p-3 md:p-2 hover:bg-gray-100 rounded-full transition-colors active:bg-gray-200"
              title="Refresh conversations"
            >
              <RefreshCw className="h-5 w-5 md:h-4 md:w-4 text-gray-500" />
            </button>
          </div>

          {/* Search input */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, label..."
              className="w-full pl-9 pr-10 py-2.5 md:py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 active:bg-gray-100 rounded"
              >
                <X className="h-5 w-5 md:h-4 md:w-4" />
              </button>
            )}
          </div>

          {/* Label filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2.5 md:py-2 text-sm border rounded-lg transition-colors active:bg-gray-100 ${
                filterLabelId ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {activeFilterLabel ? (
                    <span className="flex items-center space-x-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: activeFilterLabel.color }}
                      />
                      <span>{activeFilterLabel.name}</span>
                    </span>
                  ) : (
                    'Filter by label'
                  )}
                </span>
              </span>
              {filterLabelId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterLabelId(null);
                  }}
                  className="p-1 hover:bg-gray-200 rounded active:bg-gray-300"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </button>
            {showFilterDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 max-h-48 overflow-y-auto">
                <button
                  onClick={() => {
                    setFilterLabelId(null);
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full px-3 py-3 md:py-2 text-left text-sm hover:bg-gray-50 active:bg-gray-100 ${!filterLabelId ? 'bg-gray-100' : ''}`}
                >
                  All conversations
                </button>
                {allLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => {
                      setFilterLabelId(label.id);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full px-3 py-3 md:py-2 text-left text-sm hover:bg-gray-50 active:bg-gray-100 flex items-center space-x-2 ${filterLabelId === label.id ? 'bg-blue-50' : ''}`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </button>
                ))}
                {allLabels.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-400">No labels yet</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={filteredConversations}
            selectedId={activeConversationId || selectedConversation?.id}
            onSelect={handleSelectConversation}
          />
        </div>
      </div>

      {/* Message area - hidden on mobile when showing list */}
      <div className={`
        flex-1 flex bg-[#E5DDD5]
        transition-transform duration-250 ease-out
        ${mobileShowChat ? 'flex' : 'hidden md:flex'}
      `}>
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="bg-[#F0F2F5] px-2 md:px-4 py-2 md:py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    {/* Back button - mobile only */}
                    <button
                      onClick={handleBackToList}
                      className="md:hidden p-2 -ml-1 hover:bg-gray-200 rounded-full active:bg-gray-300"
                    >
                      <ArrowLeft className="h-5 w-5 text-gray-600" />
                    </button>
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm md:text-base font-medium ${
                      selectedConversation.is_group ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      {selectedConversation.is_group ? (
                        <Users className="h-4 w-4 md:h-5 md:w-5" />
                      ) : (
                        selectedConversation.contact_name?.charAt(0).toUpperCase() ||
                        selectedConversation.contact_phone?.charAt(0) ||
                        '?'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {selectedConversation.is_group ? (
                        // Group header - with account selector for unified groups
                        <>
                          <div className="flex items-center space-x-2">
                            <h2 className="font-medium text-gray-900 truncate text-sm md:text-base">
                              {selectedConversation.group_name || selectedConversation.display_name || 'Group'}
                            </h2>
                            {selectedConversation.is_unified_group ? (
                              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">
                                {selectedConversation.account_count} accounts
                              </span>
                            ) : (
                              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                                Group
                              </span>
                            )}
                          </div>
                          {/* Account selector for unified groups */}
                          {selectedConversation.is_unified_group && selectedConversation.accounts ? (
                            <div className="relative">
                              <button
                                onClick={() => setShowAccountSelector(!showAccountSelector)}
                                className="flex items-center space-x-1 text-xs text-purple-600 hover:text-purple-700"
                              >
                                <span>via {getSelectedAccount()?.account_name || 'Select account'}</span>
                                <ChevronDown className="h-3 w-3" />
                              </button>
                              {showAccountSelector && (
                                <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[180px]">
                                  <div className="py-1">
                                    {selectedConversation.accounts.map((account) => (
                                      <button
                                        key={account.conversation_id}
                                        onClick={() => handleSwitchAccount(account)}
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                                          activeConversationId === account.conversation_id ? 'bg-purple-50' : ''
                                        }`}
                                      >
                                        <span className="flex items-center space-x-2">
                                          <span className="w-2 h-2 rounded-full bg-purple-400" />
                                          <span>{account.account_name}</span>
                                        </span>
                                        {account.unread_count > 0 && (
                                          <span className="bg-purple-600 text-white text-[10px] min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full">
                                            {account.unread_count}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 truncate">
                              {selectedConversation.participant_count || 0} participants
                            </p>
                          )}
                        </>
                      ) : isEditingName ? (
                        <div className="flex items-center space-x-1 md:space-x-2">
                          <input
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateContactName();
                              if (e.key === 'Escape') setIsEditingName(false);
                            }}
                            className="flex-1 min-w-0 px-2 py-1 border rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            placeholder="Contact name"
                          />
                          <button
                            onClick={handleUpdateContactName}
                            className="p-2 hover:bg-green-100 rounded text-green-600 active:bg-green-200"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setIsEditingName(false)}
                            className="p-2 hover:bg-red-100 rounded text-red-600 active:bg-red-200"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center space-x-2 group">
                            <h2 className="font-medium text-gray-900 truncate text-sm md:text-base">
                              {selectedConversation.contact_name || selectedConversation.contact_phone}
                            </h2>
                            <button
                              onClick={startEditingName}
                              className="p-1.5 md:p-1 hover:bg-gray-200 rounded md:opacity-0 md:group-hover:opacity-100 transition-opacity active:bg-gray-300"
                              title="Edit contact name"
                            >
                              <Edit2 className="h-3.5 w-3.5 md:h-3 md:w-3 text-gray-500" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {selectedConversation.contact_phone}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 md:space-x-2">
                    {/* Label dropdown - only for 1:1 conversations */}
                    {!selectedConversation.is_group && (
                    <div className="relative">
                      <button
                        onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                        className={`p-2.5 md:p-2 rounded-lg transition-colors active:scale-95 ${
                          showLabelDropdown ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-500 active:bg-gray-300'
                        }`}
                        title="Add Label"
                      >
                        <Tag className="h-5 w-5" />
                      </button>
                      {showLabelDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-56 sm:w-64 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border z-50">
                          <div className="p-2.5 md:p-2 text-xs font-medium text-gray-500 border-b">Add Label</div>
                          {/* Create new label inline */}
                          <div className="p-2.5 md:p-2 border-b">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newLabelName.trim()) handleCreateLabel();
                                }}
                                placeholder="Create new label..."
                                className="flex-1 px-2.5 py-2 md:py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                onClick={handleCreateLabel}
                                disabled={!newLabelName.trim() || isCreatingLabel}
                                className="p-2 md:p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {/* Existing labels */}
                          <div className="max-h-48 overflow-y-auto">
                            {allLabels.map((label) => {
                              const isAdded = getContactLabels().some(l => l.id === label.id);
                              return (
                                <button
                                  key={label.id}
                                  onClick={() => isAdded ? handleRemoveLabel(label.id) : handleAddLabel(label.id)}
                                  className="w-full px-3 py-3 md:py-2 text-left text-sm hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between"
                                >
                                  <span className="flex items-center space-x-2">
                                    <span
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: label.color }}
                                    />
                                    <span>{label.name}</span>
                                  </span>
                                  {isAdded ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                          {allLabels.length === 0 && (
                            <div className="px-3 py-3 text-sm text-gray-400">No labels yet. Create one above!</div>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                    <button
                      onClick={() => setShowNotes(!showNotes)}
                      className={`p-2.5 md:p-2 rounded-lg transition-colors active:scale-95 ${
                        showNotes ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-200 text-gray-500 active:bg-gray-300'
                      }`}
                      title="Internal Notes"
                    >
                      <StickyNote className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setShowOrders(!showOrders)}
                      className={`p-2.5 md:p-2 rounded-lg transition-colors active:scale-95 ${
                        showOrders ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-500 active:bg-gray-300'
                      }`}
                      title="Orders"
                    >
                      <Package className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {/* Labels display - only for 1:1 conversations */}
                {!selectedConversation.is_group && getContactLabels().length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-11 sm:ml-14">
                    {getContactLabels().map((label) => (
                      <span
                        key={label.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: label.color + '20', color: label.color }}
                      >
                        {label.name}
                        <button
                          onClick={() => handleRemoveLabel(label.id)}
                          className="ml-1 hover:opacity-70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4">
                <MessageThread
                  messages={messagesList}
                  conversationId={getEffectiveConversationId() || undefined}
                  isGroup={selectedConversation?.is_group || false}
                />
              </div>

              {/* Input */}
              <div className="bg-[#F0F2F5] p-2 sm:p-3 pb-[calc(0.5rem+4rem)] md:pb-3">
                <MessageInput
                  onSend={handleSendMessage}
                  disabled={isSending}
                  conversationId={getEffectiveConversationId() || undefined}
                  prefillMessage={prefillMessage || undefined}
                  onPrefillConsumed={() => setPrefillMessage(null)}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4">
              <MessageSquare className="h-12 w-12 md:h-16 md:w-16 mb-4 text-gray-300" />
              <p className="text-base md:text-lg text-center">Select a conversation to start chatting</p>
            </div>
          )}
        </div>

        {/* Internal Notes Panel */}
        {showNotes && selectedConversation && (
          <InternalNotes
            conversationId={getEffectiveConversationId() || selectedConversation.id}
            onClose={() => setShowNotes(false)}
          />
        )}

        {/* Orders Panel */}
        {showOrders && selectedConversation && (
          <OrdersPanel
            conversationId={getEffectiveConversationId() || selectedConversation.id}
            onClose={() => setShowOrders(false)}
            onSendMessage={(msg) => setPrefillMessage(msg)}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        unreadCount={totalUnreadCount}
        onInboxClick={handleMobileInboxClick}
        showInbox={!mobileShowChat}
      />

      {/* Achievement Toast Notification */}
      {newAchievements.length > 0 && (
        <AchievementToast
          achievements={newAchievements}
          onDismiss={() => setNewAchievements([])}
        />
      )}
    </div>
  );
}
