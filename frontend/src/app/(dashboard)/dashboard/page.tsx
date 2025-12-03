'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { conversations as conversationsApi, messages as messagesApi } from '@/lib/api';
import { Conversation, Message } from '@/types';
import ConversationList from '@/components/chat/ConversationList';
import MessageThread from '@/components/chat/MessageThread';
import MessageInput from '@/components/chat/MessageInput';
import { MessageSquare } from 'lucide-react';

export default function InboxPage() {
  const { token } = useAuth();
  const [conversationsList, setConversationsList] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Socket event handlers
  const handleNewMessage = useCallback((data: any) => {
    // Add to messages if current conversation
    if (selectedConversation?.id === data.conversationId) {
      setMessagesList((prev) => [...prev, data.message]);
    }

    // Update conversations list
    setConversationsList((prev) => {
      const updated = prev.map((conv) => {
        if (conv.id === data.conversationId) {
          return {
            ...conv,
            last_message: data.message.content,
            last_message_at: data.message.created_at,
            unread_count: selectedConversation?.id === data.conversationId
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
  }, [selectedConversation?.id]);

  useSocket({
    onNewMessage: handleNewMessage,
  });

  // Load conversations
  useEffect(() => {
    if (!token) return;

    const loadConversations = async () => {
      try {
        const { conversations } = await conversationsApi.list(token);
        setConversationsList(conversations);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversations();
  }, [token]);

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
          <h1 className="text-lg font-semibold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500">{conversationsList.length} conversations</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversationsList}
            selectedId={selectedConversation?.id}
            onSelect={setSelectedConversation}
          />
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col bg-[#E5DDD5]">
        {selectedConversation ? (
          <>
            {/* Chat header */}
            <div className="bg-[#F0F2F5] px-4 py-3 border-b border-gray-200 flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                {selectedConversation.contact_name?.charAt(0).toUpperCase() ||
                  selectedConversation.contact_phone?.charAt(0) ||
                  '?'}
              </div>
              <div>
                <h2 className="font-medium text-gray-900">
                  {selectedConversation.contact_name || selectedConversation.contact_phone}
                </h2>
                <p className="text-xs text-gray-500">
                  {selectedConversation.contact_phone}
                </p>
              </div>
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
    </div>
  );
}
