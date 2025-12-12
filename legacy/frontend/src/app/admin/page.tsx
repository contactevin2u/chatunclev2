'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { admin as adminApi } from '@/lib/api';
import { Users, Smartphone, MessageSquare, Send, Wifi } from 'lucide-react';

interface Stats {
  totalAgents: number;
  totalAccounts: number;
  totalConversations: number;
  totalMessages: number;
  messagesLast24h: number;
  activeAccounts: number;
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const loadStats = async () => {
      try {
        const { stats } = await adminApi.getStats(token);
        setStats(stats);
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [token]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading statistics...</div>
      </div>
    );
  }

  const statCards = [
    {
      name: 'Total Agents',
      value: stats?.totalAgents || 0,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      name: 'WhatsApp Accounts',
      value: stats?.totalAccounts || 0,
      icon: Smartphone,
      color: 'bg-green-500',
    },
    {
      name: 'Active Connections',
      value: stats?.activeAccounts || 0,
      icon: Wifi,
      color: 'bg-emerald-500',
    },
    {
      name: 'Total Conversations',
      value: stats?.totalConversations || 0,
      icon: MessageSquare,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Messages',
      value: stats?.totalMessages || 0,
      icon: Send,
      color: 'bg-orange-500',
    },
    {
      name: 'Messages (24h)',
      value: stats?.messagesLast24h || 0,
      icon: Send,
      color: 'bg-pink-500',
    },
  ];

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((stat) => (
            <div
              key={stat.name}
              className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.name}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stat.value.toLocaleString()}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional info */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-whatsapp-dark">
                {stats?.activeAccounts || 0}/{stats?.totalAccounts || 0}
              </p>
              <p className="text-sm text-gray-500">Accounts Online</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-whatsapp-dark">
                {stats?.totalAccounts
                  ? Math.round((stats.activeAccounts / stats.totalAccounts) * 100)
                  : 0}%
              </p>
              <p className="text-sm text-gray-500">Uptime Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-whatsapp-dark">
                {stats?.totalAgents
                  ? Math.round(stats.totalMessages / stats.totalAgents)
                  : 0}
              </p>
              <p className="text-sm text-gray-500">Avg Messages/Agent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-whatsapp-dark">
                {stats?.totalAgents
                  ? (stats.totalAccounts / stats.totalAgents).toFixed(1)
                  : 0}
              </p>
              <p className="text-sm text-gray-500">Avg Accounts/Agent</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
