'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { accounts as accountsApi, telegram, meta, tiktok } from '@/lib/api';
import { WhatsAppAccount, AccountAccess } from '@/types';
import QRScanner from '@/components/whatsapp/QRScanner';
import AccountCard from '@/components/whatsapp/AccountCard';
import { ChannelIcon, getChannelName, type ChannelType } from '@/components/channel/ChannelIcon';
import { Plus, Smartphone, X, UserPlus, Trash2, Send, Instagram, Facebook, ChevronDown } from 'lucide-react';

// Unified account type for all channels
interface UnifiedAccount {
  id: string;
  channel_type: ChannelType;
  name: string;
  channel_identifier?: string;
  phone_number?: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'qr_pending';
  is_owner: boolean;
  permission: string;
  created_at: string;
  updated_at: string;
  // Channel-specific
  botInfo?: any;  // Telegram
  shopInfo?: any; // TikTok
  page_info?: any; // Meta
}

export default function AccountsPage() {
  const { token } = useAuth();
  const [allAccounts, setAllAccounts] = useState<UnifiedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | ChannelType>('all');

  // WhatsApp specific
  const [showQRModal, setShowQRModal] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');

  // Channel connection modals
  const [showConnectModal, setShowConnectModal] = useState<ChannelType | null>(null);
  const [connectForm, setConnectForm] = useState<any>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Access management state
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UnifiedAccount | null>(null);
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

  const handleAccountStatus = useCallback((data: { accountId: string; status: string; phoneNumber?: string; channelType?: string }) => {
    setAllAccounts((prev) =>
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

  // Join account rooms for real-time updates
  useEffect(() => {
    if (!allAccounts.length) return;
    allAccounts.forEach(account => {
      joinAccount(account.id);
    });
  }, [allAccounts, joinAccount]);

  // Load all accounts from all channels
  useEffect(() => {
    if (!token) return;

    const loadAllAccounts = async () => {
      try {
        const results = await Promise.allSettled([
          accountsApi.list(token),
          telegram.listAccounts(token),
          meta.listAccounts(token),
          tiktok.listAccounts(token),
        ]);

        const unified: UnifiedAccount[] = [];

        // WhatsApp accounts
        if (results[0].status === 'fulfilled') {
          const waAccounts = results[0].value.accounts.map((acc: any) => ({
            ...acc,
            channel_type: 'whatsapp' as ChannelType,
          }));
          unified.push(...waAccounts);
        }

        // Telegram accounts
        if (results[1].status === 'fulfilled') {
          const tgAccounts = results[1].value.accounts.map((acc: any) => ({
            ...acc,
            channel_type: 'telegram' as ChannelType,
            name: acc.account_name || acc.name,
          }));
          unified.push(...tgAccounts);
        }

        // Meta accounts (Instagram + Messenger)
        if (results[2].status === 'fulfilled') {
          const metaAccounts = results[2].value.accounts.map((acc: any) => ({
            ...acc,
            name: acc.name || acc.account_name,
          }));
          unified.push(...metaAccounts);
        }

        // TikTok accounts
        if (results[3].status === 'fulfilled') {
          const ttAccounts = results[3].value.accounts.map((acc: any) => ({
            ...acc,
            channel_type: 'tiktok' as ChannelType,
            name: acc.account_name || acc.name,
          }));
          unified.push(...ttAccounts);
        }

        // Sort by created_at desc
        unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllAccounts(unified);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllAccounts();
  }, [token]);

  // Filter accounts by active tab
  const filteredAccounts = activeTab === 'all'
    ? allAccounts
    : allAccounts.filter(acc => acc.channel_type === activeTab);

  // Count accounts by channel
  const channelCounts = {
    all: allAccounts.length,
    whatsapp: allAccounts.filter(a => a.channel_type === 'whatsapp').length,
    telegram: allAccounts.filter(a => a.channel_type === 'telegram').length,
    instagram: allAccounts.filter(a => a.channel_type === 'instagram').length,
    messenger: allAccounts.filter(a => a.channel_type === 'messenger').length,
    tiktok: allAccounts.filter(a => a.channel_type === 'tiktok').length,
  };

  // WhatsApp handlers
  const handleCreateWhatsAppAccount = async () => {
    if (!token) return;
    try {
      const { account } = await accountsApi.create(token, newAccountName || undefined);
      setAllAccounts((prev) => [{ ...account, channel_type: 'whatsapp' }, ...prev]);
      setPendingAccountId(account.id);
      setNewAccountName('');
      setShowQRModal(true);
      setShowConnectModal(null);
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  // Telegram handlers
  const handleConnectTelegram = async () => {
    if (!token || !connectForm.botToken) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const { account } = await telegram.addBot(token, connectForm.botToken, connectForm.accountName);
      setAllAccounts((prev) => [{ ...account, channel_type: 'telegram', name: account.accountName }, ...prev]);
      setShowConnectModal(null);
      setConnectForm({});
    } catch (error: any) {
      setConnectError(error.message || 'Failed to connect Telegram bot');
    } finally {
      setIsConnecting(false);
    }
  };

  // Meta (Instagram/Messenger) handlers
  const handleConnectMeta = async (channelType: 'instagram' | 'messenger') => {
    if (!token || !connectForm.pageId || !connectForm.pageAccessToken || !connectForm.appSecret) return;
    if (channelType === 'instagram' && !connectForm.instagramAccountId) return;

    setIsConnecting(true);
    setConnectError(null);
    try {
      const { account } = await meta.addAccount(token, {
        channelType,
        pageId: connectForm.pageId,
        pageAccessToken: connectForm.pageAccessToken,
        appSecret: connectForm.appSecret,
        instagramAccountId: connectForm.instagramAccountId,
        accountName: connectForm.accountName,
      });
      setAllAccounts((prev) => [{ ...account, name: account.name || connectForm.accountName }, ...prev]);
      setShowConnectModal(null);
      setConnectForm({});
    } catch (error: any) {
      setConnectError(error.message || `Failed to connect ${channelType}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // TikTok handlers
  const handleConnectTikTok = async () => {
    if (!token || !connectForm.appKey || !connectForm.appSecret || !connectForm.accessToken ||
        !connectForm.refreshToken || !connectForm.shopId || !connectForm.shopCipher) return;

    setIsConnecting(true);
    setConnectError(null);
    try {
      const { account } = await tiktok.addShop(token, {
        appKey: connectForm.appKey,
        appSecret: connectForm.appSecret,
        accessToken: connectForm.accessToken,
        refreshToken: connectForm.refreshToken,
        shopId: connectForm.shopId,
        shopCipher: connectForm.shopCipher,
        accountName: connectForm.accountName,
      });
      setAllAccounts((prev) => [{ ...account, channel_type: 'tiktok', name: account.accountName }, ...prev]);
      setShowConnectModal(null);
      setConnectForm({});
    } catch (error: any) {
      setConnectError(error.message || 'Failed to connect TikTok Shop');
    } finally {
      setIsConnecting(false);
    }
  };

  // Generic delete handler
  const handleDeleteAccount = async (account: UnifiedAccount) => {
    if (!token || !confirm(`Are you sure you want to remove this ${getChannelName(account.channel_type)} account?`)) return;

    try {
      switch (account.channel_type) {
        case 'whatsapp':
          await accountsApi.delete(token, account.id);
          break;
        case 'telegram':
          await telegram.deleteAccount(token, account.id);
          break;
        case 'instagram':
        case 'messenger':
          await meta.deleteAccount(token, account.id);
          break;
        case 'tiktok':
          await tiktok.deleteAccount(token, account.id);
          break;
      }
      setAllAccounts((prev) => prev.filter((acc) => acc.id !== account.id));
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  // Generic reconnect handler
  const handleReconnect = async (account: UnifiedAccount) => {
    if (!token) return;

    try {
      if (account.channel_type === 'whatsapp') {
        setPendingAccountId(account.id);
        setShowQRModal(true);
        await accountsApi.reconnect(token, account.id);
      } else {
        // For other channels, just call reconnect API
        switch (account.channel_type) {
          case 'telegram':
            await telegram.reconnect(token, account.id);
            break;
          case 'instagram':
          case 'messenger':
            await meta.reconnect(token, account.id);
            break;
          case 'tiktok':
            await tiktok.reconnect(token, account.id);
            break;
        }
        // Refresh account status
        setAllAccounts((prev) =>
          prev.map((acc) => acc.id === account.id ? { ...acc, status: 'connected' } : acc)
        );
      }
    } catch (error) {
      console.error('Failed to reconnect:', error);
    }
  };

  // Access management handlers
  const handleManageAccess = async (account: UnifiedAccount) => {
    if (!token) return;

    setSelectedAccount(account);
    setShowAccessModal(true);
    setAccessLoading(true);
    setAccessError(null);

    try {
      let access: any[];
      switch (account.channel_type) {
        case 'whatsapp':
          access = (await accountsApi.listAccess(token, account.id)).access;
          break;
        case 'telegram':
          access = (await telegram.listAccess(token, account.id)).access;
          break;
        case 'instagram':
        case 'messenger':
          access = (await meta.listAccess(token, account.id)).access;
          break;
        case 'tiktok':
          access = (await tiktok.listAccess(token, account.id)).access;
          break;
        default:
          access = [];
      }
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
      let access: any;
      switch (selectedAccount.channel_type) {
        case 'whatsapp':
          access = (await accountsApi.grantAccess(token, selectedAccount.id, newAgentEmail.trim(), newPermission)).access;
          break;
        case 'telegram':
          access = (await telegram.grantAccess(token, selectedAccount.id, newAgentEmail.trim(), newPermission)).access;
          break;
        case 'instagram':
        case 'messenger':
          access = (await meta.grantAccess(token, selectedAccount.id, newAgentEmail.trim(), newPermission)).access;
          break;
        case 'tiktok':
          access = (await tiktok.grantAccess(token, selectedAccount.id, newAgentEmail.trim(), newPermission)).access;
          break;
      }
      setAccessList((prev) => [access, ...prev]);
      setNewAgentEmail('');
      setNewPermission('full');
    } catch (error: any) {
      setAccessError(error.message || 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (agentId: string) => {
    if (!token || !selectedAccount || !confirm('Are you sure you want to revoke access?')) return;

    try {
      switch (selectedAccount.channel_type) {
        case 'whatsapp':
          await accountsApi.revokeAccess(token, selectedAccount.id, agentId);
          break;
        case 'telegram':
          await telegram.revokeAccess(token, selectedAccount.id, agentId);
          break;
        case 'instagram':
        case 'messenger':
          await meta.revokeAccess(token, selectedAccount.id, agentId);
          break;
        case 'tiktok':
          await tiktok.revokeAccess(token, selectedAccount.id, agentId);
          break;
      }
      setAccessList((prev) => prev.filter((a) => a.agent_id !== agentId));
    } catch (error: any) {
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
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
            <p className="text-gray-500">Manage your messaging channels</p>
          </div>

          {/* Add Account Dropdown */}
          <div className="relative group">
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="h-5 w-5" />
              <span>Add Account</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="py-1">
                <button
                  onClick={() => { setShowConnectModal('whatsapp'); setConnectForm({}); setConnectError(null); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <ChannelIcon channel="whatsapp" size="md" />
                  <span className="text-gray-700">WhatsApp</span>
                </button>
                <button
                  onClick={() => { setShowConnectModal('telegram'); setConnectForm({}); setConnectError(null); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <ChannelIcon channel="telegram" size="md" />
                  <span className="text-gray-700">Telegram Bot</span>
                </button>
                <button
                  onClick={() => { setShowConnectModal('instagram'); setConnectForm({}); setConnectError(null); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <ChannelIcon channel="instagram" size="md" />
                  <span className="text-gray-700">Instagram DM</span>
                </button>
                <button
                  onClick={() => { setShowConnectModal('messenger'); setConnectForm({}); setConnectError(null); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <ChannelIcon channel="messenger" size="md" />
                  <span className="text-gray-700">Messenger</span>
                </button>
                <button
                  onClick={() => { setShowConnectModal('tiktok'); setConnectForm({}); setConnectError(null); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <ChannelIcon channel="tiktok" size="md" />
                  <span className="text-gray-700">TikTok Shop</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Channel Tabs */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
          {(['all', 'whatsapp', 'telegram', 'instagram', 'messenger', 'tiktok'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab !== 'all' && <ChannelIcon channel={tab} size="sm" />}
              <span>{tab === 'all' ? 'All' : getChannelName(tab)}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                activeTab === tab ? 'bg-gray-100' : 'bg-gray-200'
              }`}>
                {channelCounts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Accounts grid */}
        {filteredAccounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Smartphone className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {activeTab === 'all' ? 'No accounts connected' : `No ${getChannelName(activeTab as ChannelType)} accounts`}
            </h3>
            <p className="text-gray-500 mb-6">
              Connect your first account to start receiving messages
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredAccounts.map((account) => (
              <div
                key={account.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <ChannelIcon channel={account.channel_type} size="lg" showBackground />
                    <div>
                      <h3 className="font-medium text-gray-900">{account.name || 'Unnamed Account'}</h3>
                      <p className="text-sm text-gray-500">
                        {account.phone_number || account.channel_identifier || account.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    account.status === 'connected'
                      ? 'bg-green-100 text-green-700'
                      : account.status === 'connecting' || account.status === 'qr_pending'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {account.status === 'qr_pending' ? 'Awaiting QR' : account.status}
                  </span>
                </div>

                {/* Permission badge if shared */}
                {!account.is_owner && (
                  <div className="mt-2">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                      Shared ({account.permission})
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center space-x-2">
                  {account.status !== 'connected' && (
                    <button
                      onClick={() => handleReconnect(account)}
                      className="flex-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                    >
                      Reconnect
                    </button>
                  )}
                  {account.is_owner && (
                    <>
                      <button
                        onClick={() => handleManageAccess(account)}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
                      >
                        Share Access
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp QR Modal */}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => { setShowQRModal(false); setShowConnectModal(null); }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWhatsAppAccount}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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

      {/* Telegram Connect Modal */}
      {showConnectModal === 'telegram' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <ChannelIcon channel="telegram" size="lg" showBackground />
              <h2 className="text-xl font-bold text-gray-900">Connect Telegram Bot</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token *</label>
                <input
                  type="text"
                  value={connectForm.botToken || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, botToken: e.target.value })}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Get this from @BotFather on Telegram</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={connectForm.accountName || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
                  placeholder="e.g., Support Bot"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {connectError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{connectError}</div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConnectModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnectTelegram}
                  disabled={!connectForm.botToken || isConnecting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Connect Modal (redirect to QR) */}
      {showConnectModal === 'whatsapp' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <ChannelIcon channel="whatsapp" size="lg" showBackground />
              <h2 className="text-xl font-bold text-gray-900">Connect WhatsApp</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g., Sales Team"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConnectModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowConnectModal(null);
                    handleCreateWhatsAppAccount();
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Continue to QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instagram Connect Modal */}
      {showConnectModal === 'instagram' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-3 mb-4">
              <ChannelIcon channel="instagram" size="lg" showBackground />
              <h2 className="text-xl font-bold text-gray-900">Connect Instagram DM</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-pink-50 text-pink-700 px-3 py-2 rounded-lg text-sm">
                Requires a Facebook Page connected to your Instagram Business/Creator account
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page ID *</label>
                <input
                  type="text"
                  value={connectForm.pageId || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, pageId: e.target.value })}
                  placeholder="123456789012345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram Account ID *</label>
                <input
                  type="text"
                  value={connectForm.instagramAccountId || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, instagramAccountId: e.target.value })}
                  placeholder="17841400000000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Page Access Token *</label>
                <input
                  type="password"
                  value={connectForm.pageAccessToken || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, pageAccessToken: e.target.value })}
                  placeholder="EAAxxxxxxx..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Secret *</label>
                <input
                  type="password"
                  value={connectForm.appSecret || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, appSecret: e.target.value })}
                  placeholder="Your Meta App Secret"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={connectForm.accountName || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
                  placeholder="e.g., Brand Instagram"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              {connectError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{connectError}</div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConnectModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConnectMeta('instagram')}
                  disabled={!connectForm.pageId || !connectForm.pageAccessToken || !connectForm.appSecret || !connectForm.instagramAccountId || isConnecting}
                  className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messenger Connect Modal */}
      {showConnectModal === 'messenger' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-3 mb-4">
              <ChannelIcon channel="messenger" size="lg" showBackground />
              <h2 className="text-xl font-bold text-gray-900">Connect Messenger</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm">
                Requires a Facebook Page with Messenger enabled
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page ID *</label>
                <input
                  type="text"
                  value={connectForm.pageId || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, pageId: e.target.value })}
                  placeholder="123456789012345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Page Access Token *</label>
                <input
                  type="password"
                  value={connectForm.pageAccessToken || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, pageAccessToken: e.target.value })}
                  placeholder="EAAxxxxxxx..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Secret *</label>
                <input
                  type="password"
                  value={connectForm.appSecret || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, appSecret: e.target.value })}
                  placeholder="Your Meta App Secret"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={connectForm.accountName || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
                  placeholder="e.g., Support Page"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {connectError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{connectError}</div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConnectModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConnectMeta('messenger')}
                  disabled={!connectForm.pageId || !connectForm.pageAccessToken || !connectForm.appSecret || isConnecting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TikTok Connect Modal */}
      {showConnectModal === 'tiktok' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-3 mb-4">
              <ChannelIcon channel="tiktok" size="lg" showBackground />
              <h2 className="text-xl font-bold text-gray-900">Connect TikTok Shop</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm">
                Requires TikTok Shop Partner API credentials. Complete OAuth first to get tokens.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Key *</label>
                <input
                  type="text"
                  value={connectForm.appKey || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, appKey: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Secret *</label>
                <input
                  type="password"
                  value={connectForm.appSecret || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, appSecret: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token *</label>
                <input
                  type="password"
                  value={connectForm.accessToken || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, accessToken: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Token *</label>
                <input
                  type="password"
                  value={connectForm.refreshToken || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, refreshToken: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shop ID *</label>
                <input
                  type="text"
                  value={connectForm.shopId || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, shopId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shop Cipher *</label>
                <input
                  type="text"
                  value={connectForm.shopCipher || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, shopCipher: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name (optional)</label>
                <input
                  type="text"
                  value={connectForm.accountName || ''}
                  onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
                  placeholder="e.g., My TikTok Shop"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              {connectError && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{connectError}</div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConnectModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnectTikTok}
                  disabled={!connectForm.appKey || !connectForm.appSecret || !connectForm.accessToken || !connectForm.refreshToken || !connectForm.shopId || !connectForm.shopCipher || isConnecting}
                  className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Management Modal */}
      {showAccessModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center space-x-3">
                <ChannelIcon channel={selectedAccount.channel_type} size="md" showBackground />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Manage Access</h2>
                  <p className="text-sm text-gray-500">{selectedAccount.name}</p>
                </div>
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
