'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { admin as adminApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, User } from 'lucide-react';

interface Conversation {
  id: string;
  last_message_at: string;
  unread_count: number;
  contact_name: string | null;
  contact_phone: string | null;
  account_name: string | null;
  agent_name: string;
  agent_email: string;
  last_message: string | null;
}

export default function AdminConversationsPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      try {
        const [convResponse, agentsResponse] = await Promise.all([
          adminApi.listConversations(token, selectedAgent || undefined),
          adminApi.listAgents(token),
        ]);
        setConversations(convResponse.conversations);
        setAgents(agentsResponse.agents.map((a: any) => ({ id: a.id, name: a.name })));
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [token, selectedAgent]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Conversations</h1>
            <p className="text-gray-500">View conversations across all agents</p>
          </div>

          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        {conversations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <MessageSquare className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations</h3>
            <p className="text-gray-500">Conversations will appear here once agents start chatting</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    {/* Contact avatar */}
                    <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-white font-medium">
                      {conversation.contact_name?.charAt(0).toUpperCase() ||
                        conversation.contact_phone?.charAt(0) ||
                        '?'}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-gray-900">
                          {conversation.contact_name || conversation.contact_phone || 'Unknown'}
                        </h3>
                        {conversation.unread_count > 0 && (
                          <span className="bg-whatsapp-light text-white text-xs font-medium px-2 py-0.5 rounded-full">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                        {conversation.last_message || 'No messages'}
                      </p>

                      {/* Agent info */}
                      <div className="flex items-center space-x-2 mt-2 text-xs text-gray-400">
                        <User className="h-3 w-3" />
                        <span>{conversation.agent_name}</span>
                        <span>&middot;</span>
                        <span>{conversation.account_name || 'Unknown Account'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {conversation.last_message_at
                        ? formatDistanceToNow(new Date(conversation.last_message_at), {
                            addSuffix: true,
                          })
                        : 'No activity'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
