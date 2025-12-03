'use client';

import { WhatsAppAccount } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Smartphone, Wifi, WifiOff, RefreshCw, Trash2, QrCode } from 'lucide-react';
import clsx from 'clsx';

interface AccountCardProps {
  account: WhatsAppAccount;
  onReconnect: () => void;
  onDelete: () => void;
}

export default function AccountCard({ account, onReconnect, onDelete }: AccountCardProps) {
  const getStatusColor = () => {
    switch (account.status) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'qr_pending':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (account.status) {
      case 'connected':
        return <Wifi className="h-5 w-5" />;
      case 'disconnected':
        return <WifiOff className="h-5 w-5" />;
      case 'qr_pending':
        return <QrCode className="h-5 w-5" />;
      default:
        return <Smartphone className="h-5 w-5" />;
    }
  };

  const getStatusText = () => {
    switch (account.status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'qr_pending':
        return 'Waiting for QR scan';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-whatsapp-light/10 rounded-full">
            <Smartphone className="h-6 w-6 text-whatsapp-dark" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">
              {account.name || 'WhatsApp Account'}
            </h3>
            {account.phone_number && (
              <p className="text-sm text-gray-500">+{account.phone_number}</p>
            )}
          </div>
        </div>

        <div className={clsx('flex items-center space-x-1', getStatusColor())}>
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Added {formatDistanceToNow(new Date(account.created_at), { addSuffix: true })}
        </p>

        <div className="flex items-center space-x-2">
          {account.status === 'disconnected' && (
            <button
              onClick={onReconnect}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-whatsapp-dark hover:bg-whatsapp-light/10 rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reconnect</span>
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span>Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}
