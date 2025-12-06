'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { templates as templatesApi, templateSequences } from '@/lib/api';
import {
  Plus, Edit2, Trash2, FileText, Command, Image, Video, Mic, Clock,
  ChevronDown, ChevronUp, GripVertical, Play, Pause, X
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
  content_type: string;
  media_url?: string;
  media_mime_type?: string;
}

interface SequenceItem {
  id?: string;
  content_type: string;
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
}

interface Sequence {
  id: string;
  name: string;
  description?: string;
  shortcut?: string;
  is_active: boolean;
  items: SequenceItem[];
}

type ContentType = 'text' | 'image' | 'video' | 'audio' | 'sticker';

const CONTENT_TYPES: { value: ContentType; label: string; icon: any }[] = [
  { value: 'text', label: 'Text Message', icon: FileText },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'audio', label: 'Voice Note', icon: Mic },
];

export default function TemplatesPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'quick' | 'sequences'>('quick');
  const [templatesList, setTemplatesList] = useState<Template[]>([]);
  const [sequencesList, setSequencesList] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick reply modal
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [quickForm, setQuickForm] = useState({
    name: '',
    content: '',
    shortcut: '',
    content_type: 'text' as ContentType,
    media_url: '',
  });

  // Sequence modal
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [sequenceForm, setSequenceForm] = useState({
    name: '',
    description: '',
    shortcut: '',
    items: [] as SequenceItem[],
  });

  // Load data
  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [templatesRes, sequencesRes] = await Promise.all([
        templatesApi.list(token),
        templateSequences.list(token).catch(() => ({ sequences: [] })),
      ]);
      setTemplatesList(templatesRes.templates);
      setSequencesList(sequencesRes.sequences || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Reply handlers
  const handleOpenQuickModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setQuickForm({
        name: template.name,
        content: template.content,
        shortcut: template.shortcut || '',
        content_type: (template.content_type || 'text') as ContentType,
        media_url: template.media_url || '',
      });
    } else {
      setEditingTemplate(null);
      setQuickForm({ name: '', content: '', shortcut: '', content_type: 'text', media_url: '' });
    }
    setShowQuickModal(true);
  };

  const handleSaveQuick = async () => {
    if (!token || !quickForm.name) return;

    try {
      if (editingTemplate) {
        const { template } = await templatesApi.update(token, editingTemplate.id, {
          name: quickForm.name,
          content: quickForm.content,
          shortcut: quickForm.shortcut || undefined,
          content_type: quickForm.content_type,
          media_url: quickForm.media_url || undefined,
        });
        setTemplatesList((prev) => prev.map((t) => (t.id === template.id ? template : t)));
      } else {
        const { template } = await templatesApi.create(
          token,
          quickForm.name,
          quickForm.content,
          quickForm.shortcut || undefined,
          {
            content_type: quickForm.content_type,
            media_url: quickForm.media_url || undefined,
          }
        );
        setTemplatesList((prev) => [template, ...prev]);
      }
      setShowQuickModal(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const handleDeleteQuick = async (id: string) => {
    if (!token || !confirm('Delete this template?')) return;
    try {
      await templatesApi.delete(token, id);
      setTemplatesList((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  // Sequence handlers
  const handleOpenSequenceModal = (sequence?: Sequence) => {
    if (sequence) {
      setEditingSequence(sequence);
      setSequenceForm({
        name: sequence.name,
        description: sequence.description || '',
        shortcut: sequence.shortcut || '',
        items: sequence.items || [],
      });
    } else {
      setEditingSequence(null);
      setSequenceForm({
        name: '',
        description: '',
        shortcut: '',
        items: [{ content_type: 'text', content: '', delay_min_seconds: 0, delay_max_seconds: 0 }],
      });
    }
    setShowSequenceModal(true);
  };

  const handleAddSequenceItem = () => {
    setSequenceForm((prev) => ({
      ...prev,
      items: [...prev.items, { content_type: 'text', content: '', delay_min_seconds: 1, delay_max_seconds: 3 }],
    }));
  };

  const handleRemoveSequenceItem = (index: number) => {
    setSequenceForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateSequenceItem = (index: number, updates: Partial<SequenceItem>) => {
    setSequenceForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    }));
  };

  const handleSaveSequence = async () => {
    if (!token || !sequenceForm.name || sequenceForm.items.length === 0) return;

    try {
      if (editingSequence) {
        const { sequence } = await templateSequences.update(token, editingSequence.id, {
          name: sequenceForm.name,
          description: sequenceForm.description || undefined,
          shortcut: sequenceForm.shortcut || undefined,
          items: sequenceForm.items,
        });
        setSequencesList((prev) => prev.map((s) => (s.id === sequence.id ? sequence : s)));
      } else {
        const { sequence } = await templateSequences.create(token, {
          name: sequenceForm.name,
          description: sequenceForm.description || undefined,
          shortcut: sequenceForm.shortcut || undefined,
          items: sequenceForm.items,
        });
        setSequencesList((prev) => [sequence, ...prev]);
      }
      setShowSequenceModal(false);
    } catch (error) {
      console.error('Failed to save sequence:', error);
    }
  };

  const handleDeleteSequence = async (id: string) => {
    if (!token || !confirm('Delete this sequence?')) return;
    try {
      await templateSequences.delete(token, id);
      setSequencesList((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Failed to delete sequence:', error);
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'audio': return <Mic className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500">Create quick replies and message sequences</p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
          <button
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'quick' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Quick Replies ({templatesList.length})
          </button>
          <button
            onClick={() => setActiveTab('sequences')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'sequences' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sequences ({sequencesList.length})
          </button>
        </div>

        {/* Quick Replies Tab */}
        {activeTab === 'quick' && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => handleOpenQuickModal()}
                className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>New Template</span>
              </button>
            </div>

            {templatesList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
                <p className="text-gray-500 mb-6">Create message templates for quick replies</p>
                <button
                  onClick={() => handleOpenQuickModal()}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal"
                >
                  <Plus className="h-5 w-5" />
                  <span>Create Template</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {templatesList.map((template) => (
                  <div key={template.id} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-1">
                          <h3 className="font-medium text-gray-900">{template.name}</h3>
                          {template.shortcut && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                              <Command className="h-3 w-3" />
                              <span>{template.shortcut}</span>
                            </span>
                          )}
                          {template.content_type && template.content_type !== 'text' && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              {getContentTypeIcon(template.content_type)}
                              <span className="capitalize">{template.content_type}</span>
                            </span>
                          )}
                        </div>
                        {template.content && (
                          <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">
                            {template.content}
                          </p>
                        )}
                        {template.media_url && (
                          <p className="mt-1 text-xs text-gray-400 truncate">
                            Media: {template.media_url.substring(0, 50)}...
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 ml-4">
                        <button
                          onClick={() => handleOpenQuickModal(template)}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuick(template.id)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Sequences Tab */}
        {activeTab === 'sequences' && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => handleOpenSequenceModal()}
                className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>New Sequence</span>
              </button>
            </div>

            {sequencesList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Clock className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No sequences yet</h3>
                <p className="text-gray-500 mb-6">Create message sequences with random delays</p>
                <button
                  onClick={() => handleOpenSequenceModal()}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal"
                >
                  <Plus className="h-5 w-5" />
                  <span>Create Sequence</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sequencesList.map((sequence) => (
                  <div key={sequence.id} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">{sequence.name}</h3>
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                            {sequence.items?.length || 0} messages
                          </span>
                          {sequence.shortcut && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                              <Command className="h-3 w-3" />
                              <span>{sequence.shortcut}</span>
                            </span>
                          )}
                        </div>
                        {sequence.description && (
                          <p className="mt-1 text-sm text-gray-500">{sequence.description}</p>
                        )}
                        {/* Preview items */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sequence.items?.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex items-center space-x-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                              {getContentTypeIcon(item.content_type)}
                              <span className="capitalize">{item.content_type}</span>
                              {item.delay_max_seconds > 0 && (
                                <span className="text-gray-400">
                                  +{item.delay_min_seconds}-{item.delay_max_seconds}s
                                </span>
                              )}
                            </div>
                          ))}
                          {(sequence.items?.length || 0) > 5 && (
                            <span className="text-xs text-gray-400">+{sequence.items.length - 5} more</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-4">
                        <button
                          onClick={() => handleOpenSequenceModal(sequence)}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSequence(sequence.id)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Reply Modal */}
      {showQuickModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={quickForm.name}
                    onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                    placeholder="e.g., Welcome message"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shortcut (optional)</label>
                  <input
                    type="text"
                    value={quickForm.shortcut}
                    onChange={(e) => setQuickForm({ ...quickForm, shortcut: e.target.value })}
                    placeholder="e.g., /welcome"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CONTENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setQuickForm({ ...quickForm, content_type: type.value })}
                        className={`p-3 rounded-lg border-2 flex flex-col items-center transition-colors ${
                          quickForm.content_type === type.value
                            ? 'border-whatsapp-dark bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <type.icon className={`h-5 w-5 ${quickForm.content_type === type.value ? 'text-whatsapp-dark' : 'text-gray-500'}`} />
                        <span className="text-xs mt-1">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {quickForm.content_type !== 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Media URL</label>
                    <input
                      type="url"
                      value={quickForm.media_url}
                      onChange={(e) => setQuickForm({ ...quickForm, media_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Enter the URL of your media file (image, video, or audio)
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {quickForm.content_type === 'text' ? 'Message Content' : 'Caption (optional)'}
                  </label>
                  <textarea
                    value={quickForm.content}
                    onChange={(e) => setQuickForm({ ...quickForm, content: e.target.value })}
                    placeholder={quickForm.content_type === 'text' ? 'Enter your message...' : 'Add a caption...'}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark resize-none"
                  />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setShowQuickModal(false)}
                    className="flex-1 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveQuick}
                    disabled={!quickForm.name || (quickForm.content_type === 'text' && !quickForm.content)}
                    className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal disabled:opacity-50"
                  >
                    {editingTemplate ? 'Save Changes' : 'Create Template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sequence Modal */}
      {showSequenceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingSequence ? 'Edit Sequence' : 'New Sequence'}
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sequence Name</label>
                    <input
                      type="text"
                      value={sequenceForm.name}
                      onChange={(e) => setSequenceForm({ ...sequenceForm, name: e.target.value })}
                      placeholder="e.g., Onboarding flow"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shortcut</label>
                    <input
                      type="text"
                      value={sequenceForm.shortcut}
                      onChange={(e) => setSequenceForm({ ...sequenceForm, shortcut: e.target.value })}
                      placeholder="/onboard"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={sequenceForm.description}
                    onChange={(e) => setSequenceForm({ ...sequenceForm, description: e.target.value })}
                    placeholder="What does this sequence do?"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                  />
                </div>

                {/* Sequence Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Messages in Sequence</label>
                    <button
                      onClick={handleAddSequenceItem}
                      className="text-sm text-whatsapp-dark hover:underline"
                    >
                      + Add Message
                    </button>
                  </div>

                  <div className="space-y-3">
                    {sequenceForm.items.map((item, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">Message {index + 1}</span>
                          {sequenceForm.items.length > 1 && (
                            <button
                              onClick={() => handleRemoveSequenceItem(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {CONTENT_TYPES.map((type) => (
                            <button
                              key={type.value}
                              onClick={() => handleUpdateSequenceItem(index, { content_type: type.value })}
                              className={`p-2 rounded border text-xs flex items-center justify-center space-x-1 ${
                                item.content_type === type.value
                                  ? 'border-whatsapp-dark bg-green-50 text-whatsapp-dark'
                                  : 'border-gray-200 text-gray-600'
                              }`}
                            >
                              <type.icon className="h-3 w-3" />
                              <span>{type.label}</span>
                            </button>
                          ))}
                        </div>

                        {item.content_type !== 'text' && (
                          <input
                            type="url"
                            value={item.media_url || ''}
                            onChange={(e) => handleUpdateSequenceItem(index, { media_url: e.target.value })}
                            placeholder="Media URL..."
                            className="w-full px-3 py-2 mb-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                          />
                        )}

                        <textarea
                          value={item.content || ''}
                          onChange={(e) => handleUpdateSequenceItem(index, { content: e.target.value })}
                          placeholder={item.content_type === 'text' ? 'Message content...' : 'Caption (optional)...'}
                          rows={2}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp-dark resize-none"
                        />

                        {/* Delay settings */}
                        <div className="mt-3 flex items-center space-x-3">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span className="text-xs text-gray-500">Delay before next:</span>
                          <input
                            type="number"
                            min="0"
                            value={item.delay_min_seconds}
                            onChange={(e) => handleUpdateSequenceItem(index, { delay_min_seconds: parseInt(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 border rounded text-sm"
                          />
                          <span className="text-xs text-gray-500">to</span>
                          <input
                            type="number"
                            min="0"
                            value={item.delay_max_seconds}
                            onChange={(e) => handleUpdateSequenceItem(index, { delay_max_seconds: parseInt(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 border rounded text-sm"
                          />
                          <span className="text-xs text-gray-500">seconds</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowSequenceModal(false)}
                    className="flex-1 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSequence}
                    disabled={!sequenceForm.name || sequenceForm.items.length === 0}
                    className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal disabled:opacity-50"
                  >
                    {editingSequence ? 'Save Changes' : 'Create Sequence'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
