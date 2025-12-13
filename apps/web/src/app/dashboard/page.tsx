'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import { Plus, LogOut, MessageSquare, Inbox, Users } from 'lucide-react';
import type { ChannelType } from '@chatuncle/shared';

interface Account {
  id: string;
  channelType: ChannelType;
  channelIdentifier: string | null;
  phoneNumber: string | null;
  status: string;
  profileName: string | null;
  profilePicUrl: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, token, logout, isLoading: authLoading } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
    }
  }, [token, authLoading, router]);

  useEffect(() => {
    if (token) {
      loadAccounts();
    }
  }, [token]);

  const loadAccounts = async () => {
    try {
      const { accounts } = await api.getAccounts();
      setAccounts(accounts);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleCreateAccount = async (channelType: ChannelType) => {
    try {
      const { account } = await api.createAccount(channelType);
      setAccounts([...accounts, account]);
      setShowCreateModal(false);
      router.push(`/chat/${account.id}`);
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">ChatUncle</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/inbox')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
              >
                <Inbox className="h-4 w-4 mr-2" />
                Open Inbox
              </button>
              <button
                onClick={() => router.push('/settings/team')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Users className="h-4 w-4 mr-2" />
                Team
              </button>
              <span className="text-sm text-gray-600">{user?.name || user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Your Accounts</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by connecting a messaging channel.</p>
            <div className="mt-6">
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                onClick={() => router.push(`/chat/${account.id}`)}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <ChannelIcon type={account.channelType} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {account.profileName || account.phoneNumber || account.channelType}
                    </p>
                    <p className="text-sm text-gray-500 capitalize">{account.channelType}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      account.status === 'connected'
                        ? 'bg-green-100 text-green-800'
                        : account.status === 'connecting'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {account.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Connect a Channel</h3>
              <div className="space-y-3">
                {(['whatsapp', 'telegram', 'tiktok', 'instagram', 'messenger'] as ChannelType[]).map(
                  (channel) => (
                    <button
                      key={channel}
                      onClick={() => handleCreateAccount(channel)}
                      className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <ChannelIcon type={channel} size={32} />
                      <span className="text-sm font-medium text-gray-900 capitalize">{channel}</span>
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-3 rounded-b-lg">
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-full text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
