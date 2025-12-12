'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { autoReply, accounts as accountsApi, templates as templatesApi } from '@/lib/api';
import { AutoReplyRule } from '@/types';
import {
  Bot,
  Plus,
  X,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Zap,
  MessageSquare,
  Code,
  Sparkles,
  TestTube,
} from 'lucide-react';

export default function AutoReplyPage() {
  const { token } = useAuth();
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    whatsappAccountId: '',
    triggerType: 'keyword' as 'keyword' | 'regex' | 'all',
    triggerKeywords: '',
    triggerRegex: '',
    responseType: 'text' as 'text' | 'template',
    responseContent: '',
    responseTemplateId: '',
    useAi: false,
    aiPrompt: '',
    priority: 0,
  });

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rulesRes, accountsRes, templatesRes] = await Promise.all([
        autoReply.list(token!),
        accountsApi.list(token!),
        templatesApi.list(token!),
      ]);
      setRules(rulesRes.rules || []);
      setAccounts(accountsRes.accounts || []);
      setTemplates(templatesRes.templates || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      alert('Please enter a rule name');
      return;
    }

    try {
      const data = {
        name: formData.name,
        whatsappAccountId: formData.whatsappAccountId || undefined,
        triggerType: formData.triggerType,
        triggerKeywords: formData.triggerType === 'keyword'
          ? formData.triggerKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : undefined,
        triggerRegex: formData.triggerType === 'regex' ? formData.triggerRegex : undefined,
        responseType: formData.responseType,
        responseContent: formData.responseType === 'text' ? formData.responseContent : undefined,
        responseTemplateId: formData.responseType === 'template' ? formData.responseTemplateId : undefined,
        useAi: formData.useAi,
        aiPrompt: formData.useAi ? formData.aiPrompt : undefined,
        priority: formData.priority,
      };

      if (editingRule) {
        await autoReply.update(token!, editingRule.id, data);
      } else {
        await autoReply.create(token!, data);
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert(`Failed to save rule: ${error.message}`);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await autoReply.toggle(token!, id);
      loadData();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await autoReply.delete(token!, id);
      loadData();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleEdit = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      whatsappAccountId: rule.whatsapp_account_id || '',
      triggerType: rule.trigger_type,
      triggerKeywords: rule.trigger_keywords?.join(', ') || '',
      triggerRegex: rule.trigger_regex || '',
      responseType: rule.response_type,
      responseContent: rule.response_content || '',
      responseTemplateId: rule.response_template_id || '',
      useAi: rule.use_ai,
      aiPrompt: rule.ai_prompt || '',
      priority: rule.priority,
    });
    setShowModal(true);
  };

  const handleTest = async () => {
    if (!testRuleId || !testMessage) return;

    try {
      const result = await autoReply.test(token!, testRuleId, testMessage);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ error: error.message });
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingRule(null);
    setFormData({
      name: '',
      whatsappAccountId: '',
      triggerType: 'keyword',
      triggerKeywords: '',
      triggerRegex: '',
      responseType: 'text',
      responseContent: '',
      responseTemplateId: '',
      useAi: false,
      aiPrompt: '',
      priority: 0,
    });
  };

  const getTriggerTypeIcon = (type: string) => {
    switch (type) {
      case 'keyword':
        return <MessageSquare className="h-4 w-4" />;
      case 'regex':
        return <Code className="h-4 w-4" />;
      case 'all':
        return <Zap className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading auto-reply rules...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auto-Reply Rules</h1>
            <p className="text-gray-500">{rules.filter(r => r.is_active).length} active rules</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            <span>New Rule</span>
          </button>
        </div>

        {/* Rules List */}
        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
              <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No auto-reply rules configured</p>
              <p className="text-sm mt-1">Create a rule to automatically respond to incoming messages</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-white rounded-lg shadow p-4 ${!rule.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="font-semibold text-gray-900">{rule.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        rule.trigger_type === 'keyword' ? 'bg-blue-100 text-blue-800' :
                        rule.trigger_type === 'regex' ? 'bg-purple-100 text-purple-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {getTriggerTypeIcon(rule.trigger_type)}
                        <span className="ml-1">{rule.trigger_type}</span>
                      </span>
                      {rule.use_ai && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI
                        </span>
                      )}
                      <span className="text-xs text-gray-400">Priority: {rule.priority}</span>
                    </div>

                    {rule.trigger_type === 'keyword' && rule.trigger_keywords && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {rule.trigger_keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-sm text-gray-600">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {rule.trigger_type === 'regex' && rule.trigger_regex && (
                      <code className="text-sm text-purple-600 bg-purple-50 px-2 py-1 rounded mb-2 inline-block">
                        {rule.trigger_regex}
                      </code>
                    )}

                    <p className="text-sm text-gray-600">
                      {rule.response_type === 'template'
                        ? `Template: ${rule.template_name || 'Unknown'}`
                        : rule.response_content?.substring(0, 100) + (rule.response_content && rule.response_content.length > 100 ? '...' : '')
                      }
                    </p>

                    {rule.account_name && (
                      <p className="text-xs text-gray-400 mt-1">Account: {rule.account_name}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setTestRuleId(rule.id);
                        setTestMessage('');
                        setTestResult(null);
                        setShowTestModal(true);
                      }}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                      title="Test Rule"
                    >
                      <TestTube className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleToggle(rule.id)}
                      className={`p-2 rounded-lg ${rule.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                      title={rule.is_active ? 'Disable' : 'Enable'}
                    >
                      {rule.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto py-8">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editingRule ? 'Edit Rule' : 'Create Auto-Reply Rule'}
              </h3>
              <button onClick={resetForm}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Business Hours Reply"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account (Optional)
                  </label>
                  <select
                    value={formData.whatsappAccountId}
                    onChange={(e) => setFormData({ ...formData, whatsappAccountId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="">All Accounts</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name || acc.phone_number || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trigger Type
                </label>
                <div className="flex space-x-2">
                  {(['keyword', 'regex', 'all'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFormData({ ...formData, triggerType: type })}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.triggerType === type
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type === 'keyword' && 'Keywords'}
                      {type === 'regex' && 'Regex Pattern'}
                      {type === 'all' && 'All Messages'}
                    </button>
                  ))}
                </div>
              </div>

              {formData.triggerType === 'keyword' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.triggerKeywords}
                    onChange={(e) => setFormData({ ...formData, triggerKeywords: e.target.value })}
                    placeholder="e.g., hello, hi, hey, help"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              )}

              {formData.triggerType === 'regex' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.triggerRegex}
                    onChange={(e) => setFormData({ ...formData, triggerRegex: e.target.value })}
                    placeholder="e.g., ^(hello|hi|hey)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Response Type
                </label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setFormData({ ...formData, responseType: 'text' })}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      formData.responseType === 'text'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Custom Text
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, responseType: 'template' })}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      formData.responseType === 'template'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Use Template
                  </button>
                </div>
              </div>

              {formData.responseType === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Response Message
                  </label>
                  <textarea
                    value={formData.responseContent}
                    onChange={(e) => setFormData({ ...formData, responseContent: e.target.value })}
                    placeholder="Type your auto-reply message..."
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              )}

              {formData.responseType === 'template' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Template
                  </label>
                  <select
                    value={formData.responseTemplateId}
                    onChange={(e) => setFormData({ ...formData, responseTemplateId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t pt-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.useAi}
                    onChange={(e) => setFormData({ ...formData, useAi: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Use AI to generate/enhance response
                  </span>
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                </label>
              </div>

              {formData.useAi && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AI Prompt (Optional)
                  </label>
                  <textarea
                    value={formData.aiPrompt}
                    onChange={(e) => setFormData({ ...formData, aiPrompt: e.target.value })}
                    placeholder="Instructions for AI on how to respond..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority (higher = checked first)
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <button
                onClick={handleSubmit}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Test Rule</h3>
              <button onClick={() => {
                setShowTestModal(false);
                setTestResult(null);
              }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Message
                </label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Type a message to test..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                onClick={handleTest}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                Test
              </button>

              {testResult && (
                <div className={`p-4 rounded-lg ${testResult.matches ? 'bg-green-50' : 'bg-gray-50'}`}>
                  {testResult.error ? (
                    <p className="text-red-600">{testResult.error}</p>
                  ) : (
                    <>
                      <p className={`font-medium ${testResult.matches ? 'text-green-800' : 'text-gray-600'}`}>
                        {testResult.matches ? 'Rule matches!' : 'No match'}
                      </p>
                      {testResult.would_respond && testResult.response_preview && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-500">Response preview:</p>
                          <p className="text-sm mt-1">{testResult.response_preview}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
