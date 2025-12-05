'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { scheduledMessages, conversations as conversationsApi, accounts as accountsApi } from '@/lib/api';
import { ScheduledMessage } from '@/types';
import {
  Clock,
  X,
  Check,
  AlertCircle,
  Trash2,
  Send,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ScheduledMessagesPage() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'cancelled'>('all');

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [messagesRes, accountsRes] = await Promise.all([
        scheduledMessages.list(token!),
        accountsApi.list(token!),
      ]);
      setMessages(messagesRes.scheduledMessages || []);
      setAccounts(accountsRes.accounts || []);

      // Load conversations for the create modal
      if (accountsRes.accounts?.length > 0) {
        const convsRes = await conversationsApi.list(token!);
        setConversations(convsRes.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedConversation || !messageContent || !scheduledAt) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await scheduledMessages.create(token!, {
        conversationId: selectedConversation,
        content: messageContent,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setShowCreateModal(false);
      setSelectedConversation('');
      setMessageContent('');
      setScheduledAt('');
      loadData();
    } catch (error: any) {
      alert(`Failed to schedule message: ${error.message}`);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled message?')) return;

    try {
      await scheduledMessages.cancel(token!, id);
      loadData();
    } catch (error) {
      console.error('Failed to cancel message:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled message?')) return;

    try {
      await scheduledMessages.delete(token!, id);
      loadData();
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const filteredMessages = messages.filter((msg) => {
    if (filter === 'all') return true;
    return msg.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <Check className="h-3 w-3 mr-1" />
            Sent
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <X className="h-3 w-3 mr-1" />
            Cancelled
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading scheduled messages...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scheduled Messages</h1>
            <p className="text-gray-500">{messages.filter(m => m.status === 'pending').length} pending messages</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Calendar className="h-4 w-4" />
            <span>Schedule Message</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex space-x-2">
            {(['all', 'pending', 'sent', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Messages List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No scheduled messages</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredMessages.map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <MessageSquare className="h-5 w-5 text-gray-400" />
                        <span className="font-medium">
                          {msg.contact_name || msg.contact_phone || 'Unknown Contact'}
                        </span>
                        {getStatusBadge(msg.status)}
                      </div>
                      <p className="text-gray-600 ml-8 mb-2">{msg.content}</p>
                      <div className="ml-8 text-sm text-gray-400">
                        <span className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          Scheduled for: {format(new Date(msg.scheduled_at), 'PPpp')}
                        </span>
                        {msg.sent_at && (
                          <span className="flex items-center mt-1">
                            <Send className="h-4 w-4 mr-1" />
                            Sent at: {format(new Date(msg.sent_at), 'PPpp')}
                          </span>
                        )}
                        {msg.error_message && (
                          <span className="flex items-center mt-1 text-red-500">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {msg.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {msg.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(msg.id)}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg"
                          title="Cancel"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Schedule Message</h3>
              <button onClick={() => setShowCreateModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conversation
                </label>
                <select
                  value={selectedConversation}
                  onChange={(e) => setSelectedConversation(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select a conversation...</option>
                  {conversations.map((conv) => (
                    <option key={conv.id} value={conv.id}>
                      {conv.contact_name || conv.contact_phone || 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule For
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={getMinDateTime()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                onClick={handleCreate}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                Schedule Message
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
