'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { accounts as accountsApi } from '@/lib/api';
import { WhatsAppAccount } from '@/types';
import QRScanner from '@/components/whatsapp/QRScanner';
import AccountCard from '@/components/whatsapp/AccountCard';
import { Plus, Smartphone } from 'lucide-react';

export default function AccountsPage() {
  const { token } = useAuth();
  const [accountsList, setAccountsList] = useState<WhatsAppAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');

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

  useSocket({
    onQrUpdate: handleQrUpdate,
    onAccountStatus: handleAccountStatus,
  });

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
    </div>
  );
}
