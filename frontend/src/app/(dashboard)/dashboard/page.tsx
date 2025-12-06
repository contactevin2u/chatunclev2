'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { conversations as conversationsApi, messages as messagesApi, labels as labelsApi, contacts as contactsApi } from '@/lib/api';
import { Conversation, Message, Label } from '@/types';
import ConversationList from '@/components/chat/ConversationList';
import MessageThread from '@/components/chat/MessageThread';
import MessageInput from '@/components/chat/MessageInput';
import InternalNotes from '@/components/chat/InternalNotes';
import { MessageSquare, RefreshCw, StickyNote, Tag, Plus, X, Check, Edit2, User, Search, Filter } from 'lucide-react';

export default function InboxPage() {
  const { token } = useAuth();
  const [conversationsList, setConversationsList] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const selectedConversationRef = useRef<Conversation | null>(null);

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
    // Search filter - search by name, phone, or last message
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const nameMatch = conv.contact_name?.toLowerCase().includes(query);
      const phoneMatch = conv.contact_phone?.toLowerCase().includes(query);
      const messageMatch = conv.last_message?.toLowerCase().includes(query);
      // Also search by label name
      const labelMatch = conv.labels?.some(l => l.name.toLowerCase().includes(query));

      if (!nameMatch && !phoneMatch && !messageMatch && !labelMatch) {
        return false;
      }
    }

    // Label filter
    if (filterLabelId) {
      const hasLabel = conv.labels?.some(l => l.id === filterLabelId);
      if (!hasLabel) return false;
    }

    return true;
  });

  // Get active filter label name
  const activeFilterLabel = filterLabelId ? allLabels.find(l => l.id === filterLabelId) : null;

  // Keep ref in sync with state for callbacks
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // Function to reload conversations
  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const { conversations } = await conversationsApi.list(token);
      setConversationsList(conversations);
      console.log('[UI] Loaded conversations:', conversations.length);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, [token]);

  // Socket event handlers
  const handleNewMessage = useCallback((data: any) => {
    console.log('[UI] New message received:', data);

    // Check if this conversation exists in our list
    const existingConv = conversationsList.find(c => c.id === data.conversationId);

    if (!existingConv) {
      // New conversation - reload the list
      console.log('[UI] New conversation detected, reloading list');
      loadConversations();
      return;
    }

    // Add to messages if current conversation
    if (selectedConversationRef.current?.id === data.conversationId) {
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

  useSocket({
    onNewMessage: handleNewMessage,
    onSyncProgress: handleSyncProgress,
    onMessageStatus: handleMessageStatus,
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

    const loadMessages = async () => {
      try {
        const { messages } = await messagesApi.list(token, selectedConversation.id);
        setMessagesList(messages);

        // Mark as read
        if (selectedConversation.unread_count > 0) {
          await conversationsApi.markRead(token, selectedConversation.id);
          setConversationsList((prev) =>
            prev.map((conv) =>
              conv.id === selectedConversation.id
                ? { ...conv, unread_count: 0 }
                : conv
            )
          );
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [token, selectedConversation]);

  const handleSendMessage = async (content: string) => {
    if (!token || !selectedConversation || !content.trim()) return;

    setIsSending(true);
    try {
      const { message } = await messagesApi.send(token, selectedConversation.id, content);
      setMessagesList((prev) => [...prev, message]);

      // Update conversation list
      setConversationsList((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversation.id
            ? { ...conv, last_message: content, last_message_at: new Date().toISOString() }
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

  return (
    <div className="h-screen flex">
      {/* Conversations sidebar */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Inbox</h1>
              <p className="text-sm text-gray-500">
                {syncStatus || `${filteredConversations.length} conversations`}
              </p>
            </div>
            <button
              onClick={loadConversations}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Refresh conversations"
            >
              <RefreshCw className="h-4 w-4 text-gray-500" />
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
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Label filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors ${
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
                  className="p-0.5 hover:bg-gray-200 rounded"
                >
                  <X className="h-3 w-3 text-gray-500" />
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
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${!filterLabelId ? 'bg-gray-100' : ''}`}
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
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center space-x-2 ${filterLabelId === label.id ? 'bg-blue-50' : ''}`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </button>
                ))}
                {allLabels.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">No labels yet</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedConversation?.id}
            onSelect={setSelectedConversation}
          />
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex bg-[#E5DDD5]">
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="bg-[#F0F2F5] px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                      {selectedConversation.contact_name?.charAt(0).toUpperCase() ||
                        selectedConversation.contact_phone?.charAt(0) ||
                        '?'}
                    </div>
                    <div>
                      {isEditingName ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateContactName();
                              if (e.key === 'Escape') setIsEditingName(false);
                            }}
                            className="px-2 py-1 border rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            placeholder="Contact name"
                          />
                          <button
                            onClick={handleUpdateContactName}
                            className="p-1 hover:bg-green-100 rounded text-green-600"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setIsEditingName(false)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 group">
                          <h2 className="font-medium text-gray-900">
                            {selectedConversation.contact_name || selectedConversation.contact_phone}
                          </h2>
                          <button
                            onClick={startEditingName}
                            className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit contact name"
                          >
                            <Edit2 className="h-3 w-3 text-gray-500" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        {selectedConversation.contact_phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* Label dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                        className={`p-2 rounded-lg transition-colors ${
                          showLabelDropdown ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-500'
                        }`}
                        title="Add Label"
                      >
                        <Tag className="h-5 w-5" />
                      </button>
                      {showLabelDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border z-50">
                          <div className="p-2 text-xs font-medium text-gray-500 border-b">Add Label</div>
                          {/* Create new label inline */}
                          <div className="p-2 border-b">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newLabelName.trim()) handleCreateLabel();
                                }}
                                placeholder="Create new label..."
                                className="flex-1 px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                onClick={handleCreateLabel}
                                disabled={!newLabelName.trim() || isCreatingLabel}
                                className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
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
                            <div className="px-3 py-2 text-sm text-gray-400">No labels yet. Create one above!</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setShowNotes(!showNotes)}
                      className={`p-2 rounded-lg transition-colors ${
                        showNotes ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-200 text-gray-500'
                      }`}
                      title="Internal Notes"
                    >
                      <StickyNote className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {/* Labels display */}
                {getContactLabels().length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-13">
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
              <div className="flex-1 overflow-y-auto p-4">
                <MessageThread messages={messagesList} />
              </div>

              {/* Input */}
              <div className="bg-[#F0F2F5] p-3">
                <MessageInput onSend={handleSendMessage} disabled={isSending} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <MessageSquare className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg">Select a conversation to start chatting</p>
            </div>
          )}
        </div>

        {/* Internal Notes Panel */}
        {showNotes && selectedConversation && (
          <InternalNotes
            conversationId={selectedConversation.id}
            onClose={() => setShowNotes(false)}
          />
        )}
      </div>
    </div>
  );
}
