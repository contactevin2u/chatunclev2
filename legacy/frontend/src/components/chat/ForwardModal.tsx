'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Forward, Search, Loader2, Users, User, Image, Video, Mic, FileText, MapPin, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { conversations as conversationsApi, messages as messagesApi } from '@/lib/api';
import { Message, Conversation } from '@/types';

interface ForwardModalProps {
  isOpen: boolean;
  message: Message | null;
  currentConversationId: string;
  onClose: () => void;
  onSuccess: (targetConversationId: string) => void;
}

export default function ForwardModal({ isOpen, message, currentConversationId, onClose, onSuccess }: ForwardModalProps) {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load conversations on mount
  useEffect(() => {
    if (!token || !isOpen) return;

    const loadConversations = async () => {
      setIsLoading(true);
      try {
        const { conversations: loadedConversations } = await conversationsApi.list(token);
        // Sort by last message time, most recent first
        const sorted = loadedConversations.sort((a: Conversation, b: Conversation) => {
          const aTime = new Date(a.last_message_at || 0).getTime();
          const bTime = new Date(b.last_message_at || 0).getTime();
          return bTime - aTime;
        });
        setConversations(sorted);
      } catch (err) {
        console.error('Failed to load conversations:', err);
        setError('Failed to load conversations');
      } finally {
        setIsLoading(false);
      }
    };

    loadConversations();
  }, [token, isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedConversationId(null);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen]);

  // Filter conversations based on search and exclude current
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Exclude current conversation
      if (conv.id === currentConversationId) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = (conv.contact_name || conv.group_name || '').toLowerCase();
        const phone = (conv.contact_phone || '').toLowerCase();
        return name.includes(query) || phone.includes(query);
      }

      return true;
    });
  }, [conversations, currentConversationId, searchQuery]);

  const handleForward = async () => {
    if (!token || !message || !selectedConversationId) return;

    setIsForwarding(true);
    setError(null);

    try {
      await messagesApi.forward(token, message.id, selectedConversationId);
      onSuccess(selectedConversationId);
      onClose();
    } catch (err: any) {
      console.error('Failed to forward message:', err);
      setError(err.message || 'Failed to forward message');
    } finally {
      setIsForwarding(false);
    }
  };

  const getMessagePreview = () => {
    if (!message) return '';

    switch (message.content_type) {
      case 'image':
        return message.content || 'Photo';
      case 'video':
        return message.content || 'Video';
      case 'audio':
        return 'Voice message';
      case 'document':
        return message.content || 'Document';
      case 'sticker':
        return 'Sticker';
      case 'location':
        return 'Location';
      default:
        return message.content || 'Message';
    }
  };

  const getContentTypeIcon = () => {
    if (!message) return null;

    switch (message.content_type) {
      case 'image':
        return <Image className="h-4 w-4 text-blue-500" />;
      case 'video':
        return <Video className="h-4 w-4 text-purple-500" />;
      case 'audio':
        return <Mic className="h-4 w-4 text-green-500" />;
      case 'document':
        return <FileText className="h-4 w-4 text-orange-500" />;
      case 'location':
        return <MapPin className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Forward className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Forward Message</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Message Preview */}
        <div className="px-4 py-3 bg-gray-50 border-b flex-shrink-0">
          <p className="text-xs text-gray-500 mb-1">Forwarding:</p>
          <div className="flex items-start gap-2">
            {getContentTypeIcon()}
            <p className="text-sm text-gray-700 line-clamp-2 flex-1">
              {getMessagePreview()}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">
                {searchQuery ? 'No conversations found' : 'No other conversations available'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                    selectedConversationId === conv.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    conv.is_group ? 'bg-blue-100' : 'bg-emerald-100'
                  }`}>
                    {conv.is_group ? (
                      <Users className="h-5 w-5 text-blue-600" />
                    ) : (
                      <User className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-gray-900 truncate">
                      {conv.contact_name || conv.group_name || conv.contact_phone || 'Unknown'}
                    </p>
                    {conv.contact_phone && !conv.is_group && (
                      <p className="text-xs text-gray-500 truncate">
                        {conv.contact_phone}
                      </p>
                    )}
                  </div>

                  {/* Selection indicator */}
                  {selectedConversationId === conv.id && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t flex-shrink-0">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
          <button
            onClick={handleForward}
            disabled={isForwarding || !selectedConversationId}
            className="w-full flex items-center justify-center space-x-2 bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isForwarding ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Forward className="h-5 w-5" />
                <span>Forward</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
