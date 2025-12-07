'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, Smile, FileText, Command } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { templates as templatesApi } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
}

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch templates on mount
  useEffect(() => {
    if (!token) return;

    const loadTemplates = async () => {
      try {
        const { templates: loadedTemplates } = await templatesApi.list(token);
        console.log('[MessageInput] Loaded templates:', loadedTemplates);
        setTemplates(loadedTemplates || []);
      } catch (error) {
        console.error('[MessageInput] Failed to load templates:', error);
      }
    };

    loadTemplates();
  }, [token]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Detect shortcut typing and filter templates
  useEffect(() => {
    if (message.startsWith('/') && templates.length > 0) {
      // Remove leading / from query for matching
      const query = message.slice(1).toLowerCase().trim();
      const matches = templates.filter((t) => {
        // Normalize shortcut by removing leading /
        const normalizedShortcut = (t.shortcut || '').toLowerCase().replace(/^\//, '');
        const shortcutMatch = normalizedShortcut.startsWith(query) || normalizedShortcut.includes(query);
        const nameMatch = t.name.toLowerCase().includes(query);
        const contentMatch = t.content.toLowerCase().includes(query);
        // Show all if query is empty (just typed /)
        return query === '' || shortcutMatch || nameMatch || contentMatch;
      });
      console.log('[MessageInput] Query:', query, 'Matches:', matches.length);
      setFilteredTemplates(matches);
      setShowTemplates(matches.length > 0);
      setSelectedIndex(0);
    } else {
      setShowTemplates(false);
      setFilteredTemplates([]);
    }
  }, [message, templates]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTemplate = (template: Template) => {
    setMessage(template.content);
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle template dropdown navigation
    if (showTemplates && filteredTemplates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredTemplates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredTemplates.length) % filteredTemplates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectTemplate(filteredTemplates[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowTemplates(false);
        return;
      }
    }

    // Normal Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="relative">
      {/* Template dropdown */}
      {showTemplates && filteredTemplates.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 sm:max-h-64 overflow-y-auto z-50"
        >
          <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Quick Replies</span>
            <span className="text-xs text-gray-400 ml-auto hidden sm:inline">↑↓ navigate • Enter select • Esc close</span>
          </div>
          {filteredTemplates.map((template, index) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex ? 'bg-whatsapp-light' : ''
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">{template.name}</span>
                {template.shortcut && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                    <Command className="h-3 w-3" />
                    <span>{template.shortcut}</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{template.content}</p>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end space-x-1 md:space-x-2">
        {/* Emoji button - hidden on mobile */}
        <button
          type="button"
          className="hidden md:block p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Smile className="h-6 w-6" />
        </button>

        {/* Attachment button - hidden on mobile */}
        <button
          type="button"
          className="hidden md:block p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Paperclip className="h-6 w-6" />
        </button>

        {/* Template button */}
        <button
          type="button"
          onClick={() => {
            if (templates.length > 0) {
              setFilteredTemplates(templates);
              setShowTemplates(!showTemplates);
              setSelectedIndex(0);
            }
          }}
          className={`relative p-2.5 md:p-2 rounded-full transition-colors active:scale-95 ${
            templates.length > 0
              ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 active:bg-gray-300'
              : 'text-gray-300 cursor-not-allowed'
          }`}
          title={templates.length > 0 ? `Quick replies (${templates.length}) - type / to search` : 'No templates - create one in Templates page'}
        >
          <FileText className="h-5 w-5 md:h-6 md:w-6" />
          {templates.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-whatsapp-dark text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
              {templates.length}
            </span>
          )}
        </button>

        {/* Input */}
        <div className="flex-1 bg-white rounded-full sm:rounded-2xl border border-gray-200 px-3 sm:px-4 py-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none outline-none text-gray-900 placeholder-gray-500 disabled:opacity-50 text-sm sm:text-base"
            style={{ minHeight: '22px', maxHeight: '100px' }}
          />
        </div>

        {/* Send or Voice button */}
        {message.trim() ? (
          <button
            type="submit"
            disabled={disabled}
            className="p-2.5 sm:p-3 bg-whatsapp-dark text-white rounded-full hover:bg-whatsapp-teal active:scale-95 transition-colors disabled:opacity-50"
          >
            <Send className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        ) : (
          <button
            type="button"
            className="p-2.5 sm:p-3 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors"
          >
            <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}
      </form>
    </div>
  );
}
