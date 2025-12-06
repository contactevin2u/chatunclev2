'use client';

import { useRef, useEffect } from 'react';
import { Message } from '@/types';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Check, CheckCheck, Clock, Image, Video, FileText, Mic, AlertCircle } from 'lucide-react';

interface MessageThreadProps {
  messages: Message[];
}

export default function MessageThread({ messages }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <p>No messages yet</p>
      </div>
    );
  }

  const getStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-gray-400" />;
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getMediaIcon = (contentType: Message['content_type']) => {
    switch (contentType) {
      case 'image':
      case 'sticker':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'audio':
        return <Mic className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {messages.map((message) => {
        const isSent = message.sender_type === 'agent';

        return (
          <div
            key={message.id}
            className={clsx('flex', isSent ? 'justify-end' : 'justify-start')}
          >
            <div
              className={clsx(
                'max-w-[70%] px-3 py-2 shadow-sm',
                isSent ? 'chat-bubble-sent' : 'chat-bubble-received'
              )}
            >
              {/* Media indicator */}
              {message.content_type !== 'text' && (
                <div className="flex items-center space-x-1 text-gray-500 mb-1">
                  {getMediaIcon(message.content_type)}
                  <span className="text-xs capitalize">{message.content_type}</span>
                </div>
              )}

              {/* Media preview */}
              {message.media_url && (message.content_type === 'image' || message.content_type === 'sticker') && (
                <img
                  src={message.media_url}
                  alt={message.content_type === 'sticker' ? 'Sticker' : 'Image'}
                  className={clsx(
                    'max-w-full rounded-lg mb-2',
                    message.content_type === 'sticker' && 'max-w-[200px]'
                  )}
                />
              )}

              {/* Audio/Voice note player */}
              {message.media_url && message.content_type === 'audio' && (
                <audio
                  controls
                  src={message.media_url}
                  className="max-w-full mb-2"
                />
              )}

              {/* Video player */}
              {message.media_url && message.content_type === 'video' && (
                <video
                  controls
                  src={message.media_url}
                  className="max-w-full rounded-lg mb-2"
                  style={{ maxHeight: '300px' }}
                />
              )}

              {/* Content */}
              {message.content && (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              )}

              {/* Time and status */}
              <div className="flex items-center justify-end space-x-1 mt-1">
                <span className="text-[10px] text-gray-500">
                  {format(new Date(message.created_at), 'HH:mm')}
                </span>
                {isSent && getStatusIcon(message.status)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
