'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { accounts as accountsApi } from '@/lib/api';
import { WhatsAppAccount, AccountAccess } from '@/types';
import QRScanner from '@/components/whatsapp/QRScanner';
import AccountCard from '@/components/whatsapp/AccountCard';
import { Plus, Smartphone, X, UserPlus, Trash2 } from 'lucide-react';

export default function AccountsPage() {
  const { token } = useAuth();
  const [accountsList, setAccountsList] = useState<WhatsAppAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');

  // Access management state
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<WhatsAppAccount | null>(null);
  const [accessList, setAccessList] = useState<AccountAccess[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newPermission, setNewPermission] = useState<'full' | 'send' | 'view'>('full');
  const [accessError, setAccessError] = useState<string | null>(null);

  // Socket handlers
  const handleQrUpdate = useCallback((data: { accountId: string; qr: string }) => {
    if (data.accountId === pendingAccountId) {
      setQrCode(data.qr);
    }
  }, [pendingAccountId]);

  const handleAccountStatus = useCallback((data: { accountId: string; status: string; phoneNumber?: string }) => {
    setAccountsList((prev) =>
      prev.map((acc) =>
        acc.id === data.accountId
          ? { ...acc, status: data.status as any, phone_number: data.phoneNumber || acc.phone_number }
          : acc
      )
    );

    if (data.status === 'connected' && data.accountId === pendingAccountId) {
      setShowQRModal(false);
      setPendingAccountId(null);
      setQrCode(null);
    }
  }, [pendingAccountId]);

  const { joinAccount } = useSocket({
    onQrUpdate: handleQrUpdate,
    onAccountStatus: handleAccountStatus,
  });

  // Join account rooms for real-time updates across all agents
  useEffect(() => {
    if (!accountsList.length) return;
    accountsList.forEach(account => {
      joinAccount(account.id);
    });
  }, [accountsList, joinAccount]);

  // Load accounts
  useEffect(() => {
    if (!token) return;

    const loadAccounts = async () => {
      try {
        const { accounts } = await accountsApi.list(token);
        setAccountsList(accounts);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, [token]);

  const handleCreateAccount = async () => {
    if (!token) return;

    try {
      const { account } = await accountsApi.create(token, newAccountName || undefined);
      setAccountsList((prev) => [account, ...prev]);
      setPendingAccountId(account.id);
      setNewAccountName('');
      setShowQRModal(true);
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!token || !confirm('Are you sure you want to remove this account?')) return;

    try {
      await accountsApi.delete(token, id);
      setAccountsList((prev) => prev.filter((acc) => acc.id !== id));
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleReconnect = async (id: string) => {
    if (!token) return;

    try {
      setPendingAccountId(id);
      setShowQRModal(true);
      await accountsApi.reconnect(token, id);
    } catch (error) {
      console.error('Failed to reconnect:', error);
    }
  };

  // Access management handlers
  const handleManageAccess = async (account: WhatsAppAccount) => {
    if (!token) return;

    setSelectedAccount(account);
    setShowAccessModal(true);
    setAccessLoading(true);
    setAccessError(null);

    try {
      const { access } = await accountsApi.listAccess(token, account.id);
      setAccessList(access);
    } catch (error) {
      console.error('Failed to load access list:', error);
      setAccessError('Failed to load access list');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleGrantAccess = async () => {
    if (!token || !selectedAccount || !newAgentEmail.trim()) return;

    setAccessError(null);

    try {
      const { access } = await accountsApi.grantAccess(token, selectedAccount.id, newAgentEmail.trim(), newPermission);
      setAccessList((prev) => [access, ...prev]);
      setNewAgentEmail('');
      setNewPermission('full');
    } catch (error: any) {
      console.error('Failed to grant access:', error);
      setAccessError(error.message || 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (agentId: string) => {
    if (!token || !selectedAccount || !confirm('Are you sure you want to revoke access?')) return;

    try {
      await accountsApi.revokeAccess(token, selectedAccount.id, agentId);
      setAccessList((prev) => prev.filter((a) => a.agent_id !== agentId));
    } catch (error: any) {
      console.error('Failed to revoke access:', error);
      setAccessError(error.message || 'Failed to revoke access');
    }
  };

  const closeAccessModal = () => {
    setShowAccessModal(false);
    setSelectedAccount(null);
    setAccessList([]);
    setNewAgentEmail('');
    setNewPermission('full');
    setAccessError(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading accounts...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp Accounts</h1>
            <p className="text-gray-500">Manage your connected WhatsApp accounts</p>
          </div>
          <button
            onClick={() => setShowQRModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>Add Account</span>
          </button>
        </div>

        {/* Accounts grid */}
        {accountsList.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Smartphone className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts connected</h3>
            <p className="text-gray-500 mb-6">
              Connect your first WhatsApp account to start receiving messages
            </p>
            <button
              onClick={() => setShowQRModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Connect WhatsApp</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accountsList.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onReconnect={() => handleReconnect(account.id)}
                onDelete={() => handleDeleteAccount(account.id)}
                onManageAccess={() => handleManageAccess(account)}
              />
            ))}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {pendingAccountId ? 'Scan QR Code' : 'Add WhatsApp Account'}
            </h2>

            {!pendingAccountId ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Name (optional)
                  </label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g., Sales Team"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowQRModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAccount}
                    className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <QRScanner
                qrCode={qrCode}
                onClose={() => {
                  setShowQRModal(false);
                  setPendingAccountId(null);
                  setQrCode(null);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Access Management Modal */}
      {showAccessModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Manage Access</h2>
                <p className="text-sm text-gray-500">{selectedAccount.name || 'WhatsApp Account'}</p>
              </div>
              <button onClick={closeAccessModal} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Grant Access Form */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Grant Access to Agent</h3>
                <div className="space-y-3">
                  <input
                    type="email"
                    value={newAgentEmail}
                    onChange={(e) => setNewAgentEmail(e.target.value)}
                    placeholder="Agent email address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex space-x-2">
                    <select
                      value={newPermission}
                      onChange={(e) => setNewPermission(e.target.value as 'full' | 'send' | 'view')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="full">Full Access - View, send, manage</option>
                      <option value="send">Send Only - View and send messages</option>
                      <option value="view">View Only - Read conversations</option>
                    </select>
                    <button
                      onClick={handleGrantAccess}
                      disabled={!newAgentEmail.trim()}
                      className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>Grant</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {accessError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
                  {accessError}
                </div>
              )}

              {/* Access List */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Agents with Access</h3>
                {accessLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : accessList.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No agents have access to this account yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accessList.map((access) => (
                      <div
                        key={access.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{access.agent_name}</p>
                          <p className="text-sm text-gray-500">{access.agent_email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {access.permission === 'full' && 'Full Access'}
                            {access.permission === 'send' && 'Send Only'}
                            {access.permission === 'view' && 'View Only'}
                            {' • '}
                            Granted {new Date(access.granted_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeAccess(access.agent_id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Revoke access"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={closeAccessModal}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
