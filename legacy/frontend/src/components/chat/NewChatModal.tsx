'use client';

import { useState, useEffect, useRef } from 'react';
import { X, MessageSquarePlus, Phone, Send, Loader2, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { accounts as accountsApi, messages as messagesApi } from '@/lib/api';

interface WhatsAppAccount {
  id: string;
  name: string | null;
  phone_number: string | null;
  status: string;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversationId: string) => void;
}

export default function NewChatModal({ isOpen, onClose, onSuccess }: NewChatModalProps) {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Load accounts on mount
  useEffect(() => {
    if (!token || !isOpen) return;

    const loadAccounts = async () => {
      setIsLoading(true);
      try {
        const { accounts: loadedAccounts } = await accountsApi.list(token);
        // Filter to only connected accounts
        const connectedAccounts = loadedAccounts.filter((a: WhatsAppAccount) => a.status === 'connected');
        setAccounts(connectedAccounts);
        if (connectedAccounts.length === 1) {
          setSelectedAccount(connectedAccounts[0].id);
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
        setError('Failed to load WhatsApp accounts');
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, [token, isOpen]);

  // Focus phone input when modal opens
  useEffect(() => {
    if (isOpen && phoneInputRef.current) {
      setTimeout(() => phoneInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPhoneNumber('');
      setMessage('');
      setError(null);
      setSelectedAccount('');
      setShowAccountDropdown(false);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!token || !selectedAccount || !phoneNumber.trim() || !message.trim()) {
      setError('Please fill in all fields');
      return;
    }

    // Basic phone validation
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      setError('Please enter a valid phone number with country code (e.g., 60123456789)');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const result = await messagesApi.sendToPhone(
        token,
        selectedAccount,
        phoneNumber,
        message
      );

      onSuccess(result.conversation.id);
      onClose();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && message.trim() && phoneNumber.trim() && selectedAccount) {
      e.preventDefault();
      handleSend();
    }
  };

  const getAccountDisplayName = (account: WhatsAppAccount) => {
    return account.name || account.phone_number || 'WhatsApp Account';
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center space-x-2">
            <MessageSquarePlus className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">New Chat</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Phone className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>No connected WhatsApp accounts</p>
              <p className="text-sm">Please connect an account first</p>
            </div>
          ) : (
            <>
              {/* Account selector */}
              {accounts.length > 1 && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send from
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <span className="text-gray-900">
                      {selectedAccountData ? getAccountDisplayName(selectedAccountData) : 'Select account'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showAccountDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-10 max-h-48 overflow-y-auto">
                      {accounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setSelectedAccount(account.id);
                            setShowAccountDropdown(false);
                          }}
                          className={`w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                            selectedAccount === account.id ? 'bg-green-50' : ''
                          }`}
                        >
                          <span>{getAccountDisplayName(account)}</span>
                          {account.phone_number && (
                            <span className="text-gray-400 text-xs">{account.phone_number}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Phone number input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="60123456789"
                    className="w-full pl-10 pr-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Include country code without + (e.g., 60 for Malaysia)
                </p>
              </div>

              {/* Message input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={3}
                  className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {accounts.length > 0 && (
          <div className="px-4 pb-4">
            <button
              onClick={handleSend}
              disabled={isSending || !selectedAccount || !phoneNumber.trim() || !message.trim()}
              className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Send Message</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
