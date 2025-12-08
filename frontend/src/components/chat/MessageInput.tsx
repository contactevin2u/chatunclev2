'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Mic, Smile, FileText, Command, X, Image, Video, Clock, Square, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { templates as templatesApi, media as mediaApi, scheduledMessages as scheduledApi } from '@/lib/api';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface Template {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
}

interface MessageInputProps {
  onSend: (content: string, contentType?: string, mediaUrl?: string, mediaMimeType?: string) => void;
  disabled?: boolean;
  conversationId?: string;
}

export default function MessageInput({ onSend, disabled, conversationId }: MessageInputProps) {
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Media attachment state
  const [attachedMedia, setAttachedMedia] = useState<{
    file: File;
    preview: string;
    type: 'image' | 'video' | 'audio';
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Fetch templates on mount
  useEffect(() => {
    if (!token) return;

    const loadTemplates = async () => {
      try {
        const { templates: loadedTemplates } = await templatesApi.list(token);
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
      const query = message.slice(1).toLowerCase().trim();
      const matches = templates.filter((t) => {
        const normalizedShortcut = (t.shortcut || '').toLowerCase().replace(/^\//, '');
        const shortcutMatch = normalizedShortcut.startsWith(query) || normalizedShortcut.includes(query);
        const nameMatch = t.name.toLowerCase().includes(query);
        const contentMatch = t.content.toLowerCase().includes(query);
        return query === '' || shortcutMatch || nameMatch || contentMatch;
      });
      setFilteredTemplates(matches);
      setShowTemplates(matches.length > 0);
      setSelectedIndex(0);
    } else {
      setShowTemplates(false);
      setFilteredTemplates([]);
    }
  }, [message, templates]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
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

  const handleEmojiSelect = (emoji: any) => {
    const cursorPosition = inputRef.current?.selectionStart || message.length;
    const newMessage = message.slice(0, cursorPosition) + emoji.native + message.slice(cursorPosition);
    setMessage(newMessage);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type.split('/')[0];
    if (!['image', 'video', 'audio'].includes(fileType)) {
      alert('Please select an image, video, or audio file');
      return;
    }

    // Create preview
    const preview = URL.createObjectURL(file);
    setAttachedMedia({
      file,
      preview,
      type: fileType as 'image' | 'video' | 'audio',
    });

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearAttachment = () => {
    if (attachedMedia?.preview) {
      URL.revokeObjectURL(attachedMedia.preview);
    }
    setAttachedMedia(null);
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Create preview and set as attachment
        const preview = URL.createObjectURL(audioBlob);
        const file = new File([audioBlob], 'voice-note.webm', { type: 'audio/webm' });
        setAttachedMedia({
          file,
          preview,
          type: 'audio',
        });
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled || isUploading) return;

    // If there's media attached, upload and send
    if (attachedMedia) {
      setIsUploading(true);
      try {
        let uploadResult;
        if (attachedMedia.type === 'audio') {
          uploadResult = await mediaApi.uploadVoice(token!, attachedMedia.file, recordingTime || undefined);
        } else {
          uploadResult = await mediaApi.upload(token!, attachedMedia.file);
        }

        const contentType = attachedMedia.type === 'audio' ? 'audio' : attachedMedia.type;
        onSend(message.trim() || '', contentType, uploadResult.url, uploadResult.mimeType);

        clearAttachment();
        setMessage('');
      } catch (error: any) {
        console.error('Failed to upload media:', error);
        alert(error.message || 'Failed to upload media');
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Regular text message
    if (message.trim()) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleScheduleSubmit = async () => {
    if (!token || !conversationId || !scheduleDate || !scheduleTime) {
      alert('Please select a date and time');
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (scheduledAt <= new Date()) {
      alert('Please select a future date and time');
      return;
    }

    try {
      // If there's media, upload it first
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      let contentType = 'text';

      if (attachedMedia) {
        setIsUploading(true);
        const uploadResult = await mediaApi.upload(token, attachedMedia.file);
        mediaUrl = uploadResult.url;
        mediaMimeType = uploadResult.mimeType;
        contentType = attachedMedia.type;
      }

      await scheduledApi.create(token, {
        conversationId,
        content: message.trim() || (attachedMedia ? 'Media' : ''),
        contentType,
        scheduledAt: scheduledAt.toISOString(),
        mediaUrl,
        mediaMimeType,
      });

      setShowScheduleModal(false);
      setScheduleDate('');
      setScheduleTime('');
      setMessage('');
      clearAttachment();
      alert('Message scheduled successfully!');
    } catch (error: any) {
      console.error('Failed to schedule message:', error);
      alert(error.message || 'Failed to schedule message');
    } finally {
      setIsUploading(false);
    }
  };

  const getMinDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  const getMinTime = () => {
    if (scheduleDate === getMinDate()) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    return '00:00';
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
      handleSubmit();
    }
  };

  const hasContent = message.trim() || attachedMedia;

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
            <span className="text-xs text-gray-400 ml-auto hidden sm:inline">Enter select</span>
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

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-2 z-50">
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            theme="light"
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
          />
        </div>
      )}

      {/* Media Preview */}
      {attachedMedia && (
        <div className="mb-2 relative inline-block">
          <div className="relative bg-gray-100 rounded-lg p-2 inline-flex items-center space-x-2">
            {attachedMedia.type === 'image' && (
              <img src={attachedMedia.preview} alt="Preview" className="h-20 w-20 object-cover rounded" />
            )}
            {attachedMedia.type === 'video' && (
              <div className="relative">
                <video src={attachedMedia.preview} className="h-20 w-20 object-cover rounded" />
                <Video className="absolute inset-0 m-auto h-8 w-8 text-white drop-shadow-lg" />
              </div>
            )}
            {attachedMedia.type === 'audio' && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 rounded">
                <Mic className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-800">Voice note</span>
              </div>
            )}
            <button
              onClick={clearAttachment}
              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="mb-2 flex items-center space-x-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-600 font-medium">Recording {formatTime(recordingTime)}</span>
          <button
            onClick={stopRecording}
            className="ml-auto p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <form onSubmit={handleSubmit} className="flex items-end space-x-1 md:space-x-2">
        {/* Emoji button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`hidden md:block p-2 rounded-full transition-colors ${
            showEmojiPicker ? 'bg-yellow-100 text-yellow-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Smile className="h-6 w-6" />
        </button>

        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRecording || isUploading}
          className="hidden md:block p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
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
          title={templates.length > 0 ? `Quick replies (${templates.length}) - type / to search` : 'No templates'}
        >
          <FileText className="h-5 w-5 md:h-6 md:w-6" />
          {templates.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-whatsapp-dark text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
              {templates.length}
            </span>
          )}
        </button>

        {/* Schedule button */}
        {conversationId && (
          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            disabled={!hasContent || isRecording || isUploading}
            className="hidden md:block p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Schedule message"
          >
            <Clock className="h-6 w-6" />
          </button>
        )}

        {/* Input */}
        <div className="flex-1 bg-white rounded-full sm:rounded-2xl border border-gray-200 px-3 sm:px-4 py-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedMedia ? 'Add a caption...' : 'Type a message...'}
            disabled={disabled || isRecording}
            rows={1}
            className="w-full resize-none outline-none text-gray-900 placeholder-gray-500 disabled:opacity-50 text-sm sm:text-base"
            style={{ minHeight: '22px', maxHeight: '100px' }}
          />
        </div>

        {/* Mobile emoji button inside send area */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="md:hidden p-2.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Smile className="h-5 w-5" />
        </button>

        {/* Mobile attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRecording || isUploading}
          className="md:hidden p-2.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Image className="h-5 w-5" />
        </button>

        {/* Send or Voice button */}
        {isUploading ? (
          <div className="p-2.5 sm:p-3 bg-gray-400 text-white rounded-full">
            <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
          </div>
        ) : hasContent ? (
          <button
            type="submit"
            disabled={disabled || isUploading}
            className="p-2.5 sm:p-3 bg-whatsapp-dark text-white rounded-full hover:bg-whatsapp-teal active:scale-95 transition-colors disabled:opacity-50"
          >
            <Send className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-2.5 sm:p-3 rounded-full transition-colors ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {isRecording ? <Square className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
          </button>
        )}
      </form>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Clock className="h-5 w-5 text-blue-500" />
                <span>Schedule Message</span>
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Preview */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Message preview:</p>
              {attachedMedia && (
                <div className="flex items-center space-x-2 mb-2">
                  {attachedMedia.type === 'image' && <Image className="h-4 w-4 text-blue-500" />}
                  {attachedMedia.type === 'video' && <Video className="h-4 w-4 text-purple-500" />}
                  {attachedMedia.type === 'audio' && <Mic className="h-4 w-4 text-green-500" />}
                  <span className="text-sm text-gray-500">{attachedMedia.file.name}</span>
                </div>
              )}
              <p className="text-gray-800">{message || '(No text)'}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={getMinDate()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  min={getMinTime()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                onClick={handleScheduleSubmit}
                disabled={!scheduleDate || !scheduleTime || isUploading}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Clock className="h-5 w-5" />
                    <span>Schedule</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
