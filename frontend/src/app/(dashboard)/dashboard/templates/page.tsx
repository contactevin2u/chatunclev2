'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { templates as templatesApi } from '@/lib/api';
import { Template } from '@/types';
import { Plus, Edit2, Trash2, FileText, Command } from 'lucide-react';

export default function TemplatesPage() {
  const { token } = useAuth();
  const [templatesList, setTemplatesList] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({ name: '', content: '', shortcut: '' });

  // Load templates
  useEffect(() => {
    if (!token) return;

    const loadTemplates = async () => {
      try {
        const { templates } = await templatesApi.list(token);
        setTemplatesList(templates);
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, [token]);

  const handleOpenModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        content: template.content,
        shortcut: template.shortcut || '',
      });
    } else {
      setEditingTemplate(null);
      setFormData({ name: '', content: '', shortcut: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!token || !formData.name || !formData.content) return;

    try {
      if (editingTemplate) {
        const { template } = await templatesApi.update(token, editingTemplate.id, formData);
        setTemplatesList((prev) =>
          prev.map((t) => (t.id === template.id ? template : t))
        );
      } else {
        const { template } = await templatesApi.create(
          token,
          formData.name,
          formData.content,
          formData.shortcut || undefined
        );
        setTemplatesList((prev) => [template, ...prev]);
      }
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Delete this template?')) return;

    try {
      await templatesApi.delete(token, id);
      setTemplatesList((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Failed to delete template:', error);
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
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-gray-500">Create quick reply templates for common messages</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>New Template</span>
          </button>
        </div>

        {/* Templates list */}
        {templatesList.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
            <p className="text-gray-500 mb-6">
              Create message templates for quick replies
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Create Template</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {templatesList.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow-sm p-4 border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-gray-900">{template.name}</h3>
                      {template.shortcut && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                          <Command className="h-3 w-3" />
                          <span>{template.shortcut}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
                      {template.content}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleOpenModal(template)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Greeting"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shortcut (optional)
                </label>
                <input
                  type="text"
                  value={formData.shortcut}
                  onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
                  placeholder="e.g., /greet"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Type this shortcut in the message input to quickly insert this template
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter your template message..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-dark resize-none"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name || !formData.content}
                  className="flex-1 px-4 py-2 bg-whatsapp-dark text-white rounded-lg hover:bg-whatsapp-teal transition-colors disabled:opacity-50"
                >
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
