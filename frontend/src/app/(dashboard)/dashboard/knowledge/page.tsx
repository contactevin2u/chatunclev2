'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { accounts as accountsApi, knowledge } from '@/lib/api';
import {
  Brain,
  Upload,
  FileText,
  Trash2,
  Settings,
  MessageSquare,
  AlertCircle,
  Check,
  Loader2,
  ChevronDown,
  Image,
  File,
} from 'lucide-react';

interface WhatsAppAccount {
  id: string;
  name: string;
  phone_number: string;
  status: string;
}

interface AISettings {
  enabled: boolean;
  auto_reply: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
  max_consecutive_replies: number;
  custom_prompt: string | null;
}

interface KnowledgeDocument {
  id: string;
  name: string;
  mime_type: string;
  content_length: number;
  chunk_count: number;
  created_at: string;
}

interface AILog {
  id: string;
  customer_message: string;
  ai_response: string;
  model: string;
  tokens_used: number;
  created_at: string;
}

export default function KnowledgeBankPage() {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accountsList, setAccountsList] = useState<WhatsAppAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'documents' | 'logs'>('settings');

  // Text content form
  const [textName, setTextName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [showTextForm, setShowTextForm] = useState(false);

  // Load accounts
  useEffect(() => {
    if (!token) return;

    const loadAccounts = async () => {
      try {
        const data = await accountsApi.list(token);
        setAccountsList(data.accounts);
        if (data.accounts.length > 0) {
          setSelectedAccount(data.accounts[0].id);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, [token]);

  // Load settings and documents when account changes
  useEffect(() => {
    if (!token || !selectedAccount) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [settingsData, docsData, logsData] = await Promise.all([
          knowledge.getSettings(token, selectedAccount),
          knowledge.listDocuments(token, selectedAccount),
          knowledge.getLogs(token, selectedAccount, 20),
        ]);

        setSettings(settingsData.settings || {
          enabled: false,
          auto_reply: false,
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 100,
          max_consecutive_replies: 2,
          custom_prompt: null,
        });
        setDocuments(docsData.documents || []);
        setLogs(logsData.logs || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, selectedAccount]);

  const handleSaveSettings = async () => {
    if (!token || !selectedAccount || !settings) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await knowledge.updateSettings(token, selectedAccount, {
        ...settings,
        custom_prompt: settings.custom_prompt || undefined,
      });
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !selectedAccount || !e.target.files?.length) return;

    const file = e.target.files[0];
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      await knowledge.uploadDocument(token, selectedAccount, file);
      setSuccess(`"${file.name}" uploaded and processed successfully`);

      // Reload documents
      const docsData = await knowledge.listDocuments(token, selectedAccount);
      setDocuments(docsData.documents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddTextContent = async () => {
    if (!token || !selectedAccount || !textName.trim() || !textContent.trim()) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      await knowledge.addTextContent(token, selectedAccount, textName, textContent);
      setSuccess(`"${textName}" added successfully`);
      setTextName('');
      setTextContent('');
      setShowTextForm(false);

      // Reload documents
      const docsData = await knowledge.listDocuments(token, selectedAccount);
      setDocuments(docsData.documents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (!token || !selectedAccount) return;
    if (!confirm(`Delete "${docName}"? This cannot be undone.`)) return;

    try {
      await knowledge.deleteDocument(token, selectedAccount, docId);
      setDocuments(docs => docs.filter(d => d.id !== docId));
      setSuccess(`"${docName}" deleted`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return <Image className="h-5 w-5 text-purple-500" />;
    if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
    return <File className="h-5 w-5 text-blue-500" />;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading && !selectedAccount) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
              <Brain className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Knowledge Bank</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure AI auto-replies and upload knowledge documents</p>
            </div>
          </div>
        </div>

        {/* Account Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select WhatsApp Account
          </label>
          <div className="relative">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {accountsList.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name || account.phone_number || 'Unnamed Account'} ({account.status})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4 flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4 flex items-center space-x-2">
            <Check className="h-5 w-5 text-green-500" />
            <span className="text-green-700 dark:text-green-300">{success}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Documents ({documents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Logs</span>
          </button>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && settings && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
            {/* Enable AI */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Enable AI Assistant</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Turn on AI-powered responses for this account</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Auto Reply */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Auto-Reply</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automatically respond to all incoming messages</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, auto_reply: !settings.auto_reply })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.auto_reply ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.auto_reply ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                AI Model
              </label>
              <select
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Affordable)</option>
                <option value="gpt-4o">GPT-4o (More Capable)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>

            {/* Max Consecutive Replies */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Consecutive AI Replies (Anti-Spam)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={settings.max_consecutive_replies}
                onChange={(e) => setSettings({ ...settings, max_consecutive_replies: parseInt(e.target.value) || 2 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                AI will stop after this many consecutive replies. Human must respond to reset.
              </p>
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Response Length (tokens)
              </label>
              <input
                type="number"
                min="50"
                max="500"
                value={settings.max_tokens}
                onChange={(e) => setSettings({ ...settings, max_tokens: parseInt(e.target.value) || 100 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Lower = shorter responses. Recommended: 100 for short casual replies.
              </p>
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Prompt (Optional)
              </label>
              <textarea
                value={settings.custom_prompt || ''}
                onChange={(e) => setSettings({ ...settings, custom_prompt: e.target.value || null })}
                rows={4}
                placeholder="Add custom instructions for the AI. E.g., 'You are a customer service rep for ABC Company. Always greet with Salam.'"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload Knowledge</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Upload PDFs, images, or text files. The AI will use this information to answer customer questions.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.txt,.csv,.json,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span>Upload File (PDF, Image, Text)</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowTextForm(!showTextForm)}
                  className="flex-1 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                >
                  <FileText className="h-5 w-5" />
                  <span>Add Text/FAQ</span>
                </button>
              </div>

              {/* Text Content Form */}
              {showTextForm && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
                  <input
                    type="text"
                    value={textName}
                    onChange={(e) => setTextName(e.target.value)}
                    placeholder="Name (e.g., 'Product FAQ', 'Shipping Policy')"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Enter your knowledge content here..."
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddTextContent}
                      disabled={uploading || !textName.trim() || !textContent.trim()}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                      {uploading ? 'Adding...' : 'Add Content'}
                    </button>
                    <button
                      onClick={() => setShowTextForm(false)}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Documents List */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Uploaded Documents ({documents.length})
              </h3>

              {documents.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No documents uploaded yet. Upload files or add text content above.
                </p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        {getFileIcon(doc.mime_type)}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{doc.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {doc.chunk_count} chunks • {formatDate(doc.created_at)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc.id, doc.name)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent AI Interactions</h3>

            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No AI interactions yet. Enable AI auto-reply to see logs here.
              </p>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(log.created_at)}
                      </span>
                      <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                        {log.model} • {log.tokens_used} tokens
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">Customer:</p>
                        <p className="text-gray-900 dark:text-white">{log.customer_message}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3">
                        <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">AI Response:</p>
                        <p className="text-gray-900 dark:text-white">{log.ai_response}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
