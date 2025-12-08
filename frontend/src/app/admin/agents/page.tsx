'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { admin as adminApi } from '@/lib/api';
import { Plus, Edit2, Trash2, Users, Shield, User, Share2, ChevronDown, ChevronUp, Smartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Agent {
  id: string;
  email: string;
  name: string;
  role: 'agent' | 'admin';
  created_at: string;
  account_count: number;
  conversation_count: number;
  shared_account_count: number;
}

interface SharedAccount {
  access_id: string;
  permission: 'full' | 'send' | 'view';
  granted_at: string;
  account_id: string;
  account_name: string | null;
  phone_number: string | null;
  status: string;
  owner_name: string;
  owner_email: string;
}

export default function AgentsPage() {
  const { token, user: currentUser } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'agent' as 'agent' | 'admin',
  });

  // Shared accounts expansion state
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [sharedAccounts, setSharedAccounts] = useState<SharedAccount[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);

  useEffect(() => {
    if (!token) return;

    const loadAgents = async () => {
      try {
        const { agents } = await adminApi.listAgents(token);
        setAgents(agents);
      } catch (error) {
        console.error('Failed to load agents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAgents();
  }, [token]);

  const handleOpenModal = (agent?: Agent) => {
    if (agent) {
      setEditingAgent(agent);
      setFormData({
        name: agent.name,
        email: agent.email,
        password: '',
        role: agent.role,
      });
    } else {
      setEditingAgent(null);
      setFormData({ name: '', email: '', password: '', role: 'agent' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!token) return;

    try {
      if (editingAgent) {
        const updateData: any = { name: formData.name, role: formData.role };
        if (formData.password) updateData.password = formData.password;

        const { agent } = await adminApi.updateAgent(token, editingAgent.id, updateData);
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, ...agent } : a))
        );
      } else {
        if (!formData.password) {
          alert('Password is required for new agents');
          return;
        }
        const { agent } = await adminApi.createAgent(
          token,
          formData.email,
          formData.password,
          formData.name,
          formData.role
        );
        setAgents((prev) => [{ ...agent, account_count: 0, conversation_count: 0 }, ...prev]);
      }
      setShowModal(false);
    } catch (error: any) {
      alert(error.message || 'Failed to save agent');
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this agent? This will also delete all their accounts and messages.')) return;

    try {
      await adminApi.deleteAgent(token, id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (error: any) {
      alert(error.message || 'Failed to delete agent');
    }
  };

  const toggleExpand = async (agentId: string) => {
    if (expandedAgentId === agentId) {
      setExpandedAgentId(null);
      setSharedAccounts([]);
      return;
    }

    setExpandedAgentId(agentId);
    setLoadingShared(true);

    try {
      const { sharedAccounts: accounts } = await adminApi.getAgentSharedAccounts(token!, agentId);
      setSharedAccounts(accounts);
    } catch (error) {
      console.error('Failed to load shared accounts:', error);
      setSharedAccounts([]);
    } finally {
      setLoadingShared(false);
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'full': return 'Full Access';
      case 'send': return 'Send Only';
      case 'view': return 'View Only';
      default: return permission;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
            <p className="text-gray-500">Manage sales agents and their access</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>Add Agent</span>
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Users className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No agents yet</h3>
            <p className="text-gray-500 mb-6">Add your first sales agent</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owned
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shared
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversations
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {agents.map((agent) => (
                  <>
                    <tr key={agent.id} className={expandedAgentId === agent.id ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center text-white font-medium">
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                            <div className="text-sm text-gray-500">{agent.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.role === 'admin'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {agent.role === 'admin' ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          <span>{agent.role === 'admin' ? 'Admin' : 'Agent'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {agent.account_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {Number(agent.shared_account_count) > 0 ? (
                          <button
                            onClick={() => toggleExpand(agent.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                          >
                            <Share2 className="h-3 w-3" />
                            <span>{agent.shared_account_count}</span>
                            {expandedAgentId === agent.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {agent.conversation_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleOpenModal(agent)}
                          className="text-slate-600 hover:text-slate-900 mr-3"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {agent.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDelete(agent.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Expanded shared accounts row */}
                    {expandedAgentId === agent.id && (
                      <tr key={`${agent.id}-expanded`}>
                        <td colSpan={7} className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                          <div className="ml-14">
                            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                              <Share2 className="h-4 w-4 mr-2 text-blue-600" />
                              Shared Accounts
                            </h4>
                            {loadingShared ? (
                              <div className="text-sm text-gray-500">Loading...</div>
                            ) : sharedAccounts.length === 0 ? (
                              <div className="text-sm text-gray-500">No shared accounts</div>
                            ) : (
                              <div className="space-y-2">
                                {sharedAccounts.map((account) => (
                                  <div
                                    key={account.access_id}
                                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                                  >
                                    <div className="flex items-center space-x-3">
                                      <div className="p-2 bg-gray-100 rounded-full">
                                        <Smartphone className="h-4 w-4 text-gray-600" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">
                                          {account.account_name || 'WhatsApp Account'}
                                          {account.phone_number && (
                                            <span className="text-gray-500 ml-2">+{account.phone_number}</span>
                                          )}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          Owner: {account.owner_name} ({account.owner_email})
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        account.status === 'connected'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {account.status}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        account.permission === 'full'
                                          ? 'bg-purple-100 text-purple-800'
                                          : account.permission === 'send'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {getPermissionLabel(account.permission)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingAgent ? 'Edit Agent' : 'Add Agent'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingAgent}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingAgent ? 'New Password (leave blank to keep)' : 'Password'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'agent' | 'admin' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name || !formData.email}
                  className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
