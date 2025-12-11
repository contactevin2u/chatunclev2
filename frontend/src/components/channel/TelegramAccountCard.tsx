'use client';

import { useState } from 'react';
import { Send, Trash2, RefreshCw, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { ChannelIcon } from './ChannelIcon';

interface TelegramAccount {
  id: string;
  channel_identifier: string;
  account_name: string;
  status: string;
  botInfo?: {
    id: number;
    username: string;
    firstName: string;
  };
  isConnected: boolean;
  created_at: string;
}

interface TelegramAccountCardProps {
  account: TelegramAccount;
  onDelete: (id: string) => void;
  onReconnect: (id: string) => void;
  isDeleting?: boolean;
  isReconnecting?: boolean;
}

export function TelegramAccountCard({
  account,
  onDelete,
  onReconnect,
  isDeleting,
  isReconnecting,
}: TelegramAccountCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(account.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const statusIcon = () => {
    if (account.isConnected || account.status === 'connected') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (account.status === 'connecting') {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const statusText = () => {
    if (account.isConnected || account.status === 'connected') {
      return 'Connected';
    }
    if (account.status === 'connecting') {
      return 'Connecting...';
    }
    return 'Disconnected';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ChannelIcon channel="telegram" size="lg" showBackground />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {account.account_name || account.botInfo?.firstName || 'Telegram Bot'}
            </h3>
            {account.botInfo?.username && (
              <a
                href={`https://t.me/${account.botInfo.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
              >
                @{account.botInfo.username}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusIcon()}
          <span className={`text-sm ${
            account.isConnected || account.status === 'connected'
              ? 'text-green-600'
              : account.status === 'connecting'
              ? 'text-blue-600'
              : 'text-red-600'
          }`}>
            {statusText()}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-4">
        <span className="text-xs text-gray-500">
          Added {new Date(account.created_at).toLocaleDateString()}
        </span>

        <div className="flex items-center gap-2">
          {(!account.isConnected && account.status !== 'connected') && (
            <button
              onClick={() => onReconnect(account.id)}
              disabled={isReconnecting}
              className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isReconnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reconnect
            </button>
          )}

          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Confirm?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"
              title="Delete account"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface AddTelegramBotProps {
  onAdd: (botToken: string, accountName?: string) => Promise<void>;
  isAdding?: boolean;
}

export function AddTelegramBot({ onAdd, isAdding }: AddTelegramBotProps) {
  const [botToken, setBotToken] = useState('');
  const [accountName, setAccountName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!botToken.trim()) {
      setError('Bot token is required');
      return;
    }

    // Basic validation
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      setError('Invalid bot token format. Get it from @BotFather on Telegram.');
      return;
    }

    try {
      await onAdd(botToken.trim(), accountName.trim() || undefined);
      setBotToken('');
      setAccountName('');
    } catch (err: any) {
      setError(err.message || 'Failed to add bot');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3 mb-4">
        <ChannelIcon channel="telegram" size="lg" showBackground />
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">Add Telegram Bot</h3>
          <p className="text-sm text-gray-500">Connect a bot from @BotFather</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bot Token <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500">
            Get this from{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              @BotFather
            </a>{' '}
            on Telegram
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Display Name (optional)
          </label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="My Support Bot"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={isAdding || !botToken.trim()}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isAdding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Connect Bot
            </>
          )}
        </button>
      </form>
    </div>
  );
}
