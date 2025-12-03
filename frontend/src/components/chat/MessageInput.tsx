'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, Smile } from 'lucide-react';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end space-x-2">
      {/* Emoji button */}
      <button
        type="button"
        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
      >
        <Smile className="h-6 w-6" />
      </button>

      {/* Attachment button */}
      <button
        type="button"
        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
      >
        <Paperclip className="h-6 w-6" />
      </button>

      {/* Input */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 px-4 py-2">
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          disabled={disabled}
          rows={1}
          className="w-full resize-none outline-none text-gray-900 placeholder-gray-500 disabled:opacity-50"
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
      </div>

      {/* Send or Voice button */}
      {message.trim() ? (
        <button
          type="submit"
          disabled={disabled}
          className="p-2 bg-whatsapp-dark text-white rounded-full hover:bg-whatsapp-teal transition-colors disabled:opacity-50"
        >
          <Send className="h-6 w-6" />
        </button>
      ) : (
        <button
          type="button"
          className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Mic className="h-6 w-6" />
        </button>
      )}
    </form>
  );
}
