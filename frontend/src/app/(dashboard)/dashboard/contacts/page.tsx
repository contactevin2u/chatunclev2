'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { contacts, labels as labelsApi, accounts as accountsApi, contactsExtended } from '@/lib/api';
import { Contact, Label } from '@/types';
import {
  Search,
  Upload,
  Download,
  Tag,
  Plus,
  X,
  Check,
  UserPlus,
} from 'lucide-react';

export default function ContactsPage() {
  const { token } = useAuth();
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [labelsList, setLabelsList] = useState<Label[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3B82F6');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, selectedAccount, selectedLabel, searchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [contactsRes, labelsRes, accountsRes] = await Promise.all([
        contacts.list(token!, {
          accountId: selectedAccount || undefined,
          labelId: selectedLabel || undefined,
          search: searchQuery || undefined,
        }),
        labelsApi.list(token!),
        accountsApi.list(token!),
      ]);

      setContactsList(contactsRes.contacts);
      setLabelsList(labelsRes.labels);
      setAccounts(accountsRes.accounts);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!selectedAccount) {
      alert('Please select an account to export contacts');
      return;
    }
    const url = contactsExtended.export(token!, selectedAccount);
    window.open(url, '_blank');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAccount) {
      alert('Please select an account and file');
      return;
    }

    try {
      const result = await contactsExtended.import(token!, selectedAccount, file);
      alert(`Imported ${result.imported} contacts`);
      loadData();
      setShowImportModal(false);
    } catch (error: any) {
      alert(`Import failed: ${error.message}`);
    }
  };

  const handleBulkLabel = async (labelId: string) => {
    if (selectedContacts.size === 0) return;

    try {
      await contactsExtended.bulkLabel(token!, Array.from(selectedContacts), labelId);
      loadData();
      setSelectedContacts(new Set());
    } catch (error) {
      console.error('Failed to add labels:', error);
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;

    try {
      await labelsApi.create(token!, newLabelName, newLabelColor);
      setNewLabelName('');
      setShowLabelModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to create label:', error);
    }
  };

  const toggleContact = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  const toggleAll = () => {
    if (selectedContacts.size === contactsList.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contactsList.map(c => c.id)));
    }
  };

  return (
    <div className="h-screen overflow-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-500">{contactsList.length} contacts</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowLabelModal(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Tag className="h-4 w-4" />
              <span>New Label</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.phone_number || 'Unnamed'}
                </option>
              ))}
            </select>
            <select
              value={selectedLabel}
              onChange={(e) => setSelectedLabel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Labels</option>
              {labelsList.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedContacts.size > 0 && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4 flex items-center justify-between">
            <span className="text-blue-800">{selectedContacts.size} contacts selected</span>
            <div className="flex items-center space-x-2">
              <select
                onChange={(e) => {
                  if (e.target.value) handleBulkLabel(e.target.value);
                  e.target.value = '';
                }}
                className="border border-blue-300 rounded-lg px-3 py-1 bg-white text-sm"
              >
                <option value="">Add Label...</option>
                {labelsList.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSelectedContacts(new Set())}
                className="px-3 py-1 text-blue-600 hover:bg-blue-100 rounded"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Labels Bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {labelsList.map((label) => (
            <button
              key={label.id}
              onClick={() => setSelectedLabel(selectedLabel === label.id ? '' : label.id)}
              className={`px-3 py-1 rounded-full text-sm flex items-center space-x-1 ${
                selectedLabel === label.id
                  ? 'ring-2 ring-offset-2 ring-blue-500'
                  : ''
              }`}
              style={{ backgroundColor: label.color + '20', color: label.color }}
            >
              <span>{label.name}</span>
            </button>
          ))}
        </div>

        {/* Contacts Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedContacts.size === contactsList.length && contactsList.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Labels</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {contactsList.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                        {contact.name?.charAt(0).toUpperCase() || contact.phone_number?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium">{contact.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{contact.phone_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {contact.labels?.map((label) => (
                        <span
                          key={label.id}
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{ backgroundColor: label.color + '20', color: label.color }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contactsList.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No contacts found
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Import Contacts</h3>
              <button onClick={() => setShowImportModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Account
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name || acc.phone_number || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  ref={fileInputRef}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  CSV should have columns: phone_number, name (optional)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Label Modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Label</h3>
              <button onClick={() => setShowLabelModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label Name
                </label>
                <input
                  type="text"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="e.g., VIP, Lead, Customer"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>
              <button
                onClick={handleCreateLabel}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                Create Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
