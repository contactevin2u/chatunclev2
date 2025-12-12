'use client';

import { format } from 'date-fns';
import { Message } from '@/stores/messages';
import { Check, CheckCheck, Clock, AlertCircle, Image, Video, FileText, Mic } from 'lucide-react';
import clsx from 'clsx';

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
}

export function MessageBubble({ message, showSender }: MessageBubbleProps) {
  const isOutgoing = message.senderType === 'agent';
  const isSystem = message.senderType === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="px-3 py-1 text-xs text-gray-500 bg-gray-200 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={clsx('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
          isOutgoing ? 'bg-primary-600 text-white' : 'bg-white text-gray-900',
          message.isPending && 'opacity-70'
        )}
      >
        {/* Sender name for incoming group messages */}
        {showSender && !isOutgoing && message.senderName && (
          <p className="text-xs font-medium text-primary-600 mb-1">{message.senderName}</p>
        )}

        {/* Quoted message */}
        {message.quotedContent && (
          <div
            className={clsx(
              'border-l-2 pl-2 mb-2 text-sm opacity-75',
              isOutgoing ? 'border-white/50' : 'border-gray-300'
            )}
          >
            {message.quotedSenderName && (
              <p className="font-medium text-xs">{message.quotedSenderName}</p>
            )}
            <p className="truncate">{message.quotedContent}</p>
          </div>
        )}

        {/* Message content */}
        {renderContent(message, isOutgoing)}

        {/* Footer: time and status */}
        <div
          className={clsx(
            'flex items-center justify-end gap-1 mt-1',
            isOutgoing ? 'text-white/70' : 'text-gray-400'
          )}
        >
          <span className="text-[10px]">{format(new Date(message.createdAt), 'HH:mm')}</span>
          {isOutgoing && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function renderContent(message: Message, isOutgoing: boolean) {
  switch (message.contentType) {
    case 'text':
      return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;

    case 'image':
      return (
        <div>
          {message.mediaUrl ? (
            <img
              src={message.mediaUrl}
              alt="Image"
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Image className="h-4 w-4" />
              <span>Image</span>
            </div>
          )}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words mt-2">{message.content}</p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {message.mediaUrl ? (
            <video src={message.mediaUrl} controls className="max-w-full rounded-lg" />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Video className="h-4 w-4" />
              <span>Video</span>
            </div>
          )}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words mt-2">{message.content}</p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4" />
          {message.mediaUrl ? (
            <audio src={message.mediaUrl} controls className="max-w-[200px]" />
          ) : (
            <span className="text-sm">Audio message</span>
          )}
        </div>
      );

    case 'document':
      return (
        <a
          href={message.mediaUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            'flex items-center gap-2 text-sm',
            isOutgoing ? 'text-white hover:underline' : 'text-primary-600 hover:underline'
          )}
        >
          <FileText className="h-4 w-4" />
          <span>{message.content || 'Document'}</span>
        </a>
      );

    case 'sticker':
      return message.mediaUrl ? (
        <img src={message.mediaUrl} alt="Sticker" className="w-32 h-32" loading="lazy" />
      ) : (
        <span className="text-sm">Sticker</span>
      );

    case 'location':
      return (
        <div className="text-sm">
          <span className="mr-1">📍</span>
          {message.content || 'Location'}
        </div>
      );

    default:
      return <p className="text-sm">{message.content || `[${message.contentType}]`}</p>;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3 w-3" />;
    case 'sent':
      return <Check className="h-3 w-3" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-300" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-red-300" />;
    default:
      return null;
  }
}
