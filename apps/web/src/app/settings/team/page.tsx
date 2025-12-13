'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import { ArrowLeft, Users, Plus, Trash2, Shield, Crown, User } from 'lucide-react';
import clsx from 'clsx';
import type { ChannelType } from '@chatuncle/shared';

interface Account {
  id: string;
  channelType: ChannelType;
  name: string | null;
  phoneNumber: string | null;
  status: string;
}

interface Agent {
  agentId: string;
  agentName: string;
  agentEmail: string;
  role: 'owner' | 'admin' | 'agent';
}

export default function TeamManagementPage() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newAgentRole, setNewAgentRole] = useState<'admin' | 'agent'>('agent');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
      return;
    }

    if (token) {
      loadAccounts();
    }
  }, [token, authLoading]);

  useEffect(() => {
    if (selectedAccountId) {
      loadAgents(selectedAccountId);
    }
  }, [selectedAccountId]);

  const loadAccounts = async () => {
    try {
      const { accounts: loadedAccounts } = await api.getAccounts();
      setAccounts(loadedAccounts);
      if (loadedAccounts.length > 0) {
        setSelectedAccountId(loadedAccounts[0].id);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAgents = async (accountId: string) => {
    try {
      const { agents: loadedAgents } = await api.getAccountAgents(accountId);
      setAgents(loadedAgents);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const handleAddAgent = async () => {
    if (!selectedAccountId || !newAgentEmail.trim()) return;

    setError(null);
    try {
      await api.addAccountAgent(selectedAccountId, newAgentEmail.trim(), newAgentRole);
      await loadAgents(selectedAccountId);
      setShowAddModal(false);
      setNewAgentEmail('');
      setNewAgentRole('agent');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to add team member');
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (!selectedAccountId) return;
    if (!confirm('Are you sure you want to remove this team member?')) return;

    try {
      await api.removeAccountAgent(selectedAccountId, agentId);
      await loadAgents(selectedAccountId);
    } catch (error) {
      console.error('Failed to remove agent:', error);
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const currentUserRole = agents.find(a => a.agentId === user?.id)?.role;
  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin';

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-gray-500" />;
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
          <div className="flex items-center py-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="mr-4 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Users className="h-5 w-5 text-primary-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Team Management</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {accounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No accounts found. Create an account first.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-4 text-primary-600 hover:text-primary-700"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Account Selector */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">Select Account</h2>
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => setSelectedAccountId(account.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                        account.id === selectedAccountId
                          ? 'bg-primary-50 border border-primary-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      <ChannelIcon type={account.channelType} size={24} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {account.name || account.phoneNumber || account.channelType}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{account.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Members */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">Team Members</h2>
                    {selectedAccount && (
                      <p className="text-sm text-gray-500">
                        Managing team for: {selectedAccount.name || selectedAccount.channelType}
                      </p>
                    )}
                  </div>
                  {canManageTeam && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Member
                    </button>
                  )}
                </div>

                <div className="divide-y divide-gray-200">
                  {agents.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-500">
                      No team members found
                    </div>
                  ) : (
                    agents.map((agent) => (
                      <div
                        key={agent.agentId}
                        className="px-6 py-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                            {agent.agentName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">{agent.agentName}</p>
                              {getRoleIcon(agent.role)}
                            </div>
                            <p className="text-sm text-gray-500">{agent.agentEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={clsx(
                              'px-2 py-1 text-xs font-medium rounded-full capitalize',
                              agent.role === 'owner'
                                ? 'bg-yellow-100 text-yellow-800'
                                : agent.role === 'admin'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            )}
                          >
                            {agent.role}
                          </span>
                          {canManageTeam && agent.role !== 'owner' && agent.agentId !== user?.id && (
                            <button
                              onClick={() => handleRemoveAgent(agent.agentId)}
                              className="text-red-500 hover:text-red-700"
                              title="Remove member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Role Legend */}
              <div className="mt-4 bg-white rounded-lg shadow p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Role Permissions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Owner
                    </div>
                    <p className="text-gray-500 mt-1">Full access, can manage all team members</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <Shield className="h-4 w-4 text-blue-500" />
                      Admin
                    </div>
                    <p className="text-gray-500 mt-1">Can add/remove agents, manage conversations</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <User className="h-4 w-4 text-gray-500" />
                      Agent
                    </div>
                    <p className="text-gray-500 mt-1">Can view and respond to conversations</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Team Member</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newAgentEmail}
                    onChange={(e) => setNewAgentEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The user must already have a ChatUncle account
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={newAgentRole}
                    onChange={(e) => setNewAgentRole(e.target.value as 'admin' | 'agent')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="agent">Agent - Can view and respond to conversations</option>
                    <option value="admin">Admin - Can also manage team members</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 rounded-b-lg flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setError(null);
                  setNewAgentEmail('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAgent}
                disabled={!newAgentEmail.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
