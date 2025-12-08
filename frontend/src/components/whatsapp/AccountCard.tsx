'use client';

import { WhatsAppAccount } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Smartphone, Wifi, WifiOff, RefreshCw, Trash2, QrCode, Users, Share2 } from 'lucide-react';
import clsx from 'clsx';

interface AccountCardProps {
  account: WhatsAppAccount;
  onReconnect: () => void;
  onDelete: () => void;
  onManageAccess?: () => void;
}

export default function AccountCard({ account, onReconnect, onDelete, onManageAccess }: AccountCardProps) {
  const isOwner = account.is_owner !== false; // Default to true if not specified
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

  const getPermissionLabel = () => {
    switch (account.permission) {
      case 'full': return 'Full Access';
      case 'send': return 'Send Only';
      case 'view': return 'View Only';
      default: return '';
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
            <div className="flex items-center space-x-2">
              <h3 className="font-medium text-gray-900">
                {account.name || 'WhatsApp Account'}
              </h3>
              {!isOwner && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <Share2 className="h-3 w-3 mr-1" />
                  Shared
                </span>
              )}
            </div>
            {account.phone_number && (
              <p className="text-sm text-gray-500">+{account.phone_number}</p>
            )}
            {!isOwner && account.owner_name && (
              <p className="text-xs text-gray-400">
                Owner: {account.owner_name} • {getPermissionLabel()}
              </p>
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
          {/* Manage Access - only for owners */}
          {isOwner && onManageAccess && (
            <button
              onClick={onManageAccess}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Users className="h-4 w-4" />
              <span>Manage Access</span>
            </button>
          )}
          {/* Reconnect/rescan - only for owners */}
          {isOwner && (
            <button
              onClick={onReconnect}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-whatsapp-dark hover:bg-whatsapp-light/10 rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{account.status === 'connected' ? 'Rescan QR' : 'Reconnect'}</span>
            </button>
          )}
          {/* Delete - only for owners */}
          {isOwner && (
            <button
              onClick={onDelete}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
