'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/types';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Check, CheckCheck, Clock, Image, Video, FileText, Mic, AlertCircle, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { orderops } from '@/lib/api';

interface MessageThreadProps {
  messages: Message[];
  conversationId?: string;
}

export default function MessageThread({ messages, conversationId }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<{ id: string; success: boolean; data?: any } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendToOrderOps = async (messageId: string) => {
    if (!token || !conversationId) return;

    setParsingId(messageId);
    setParseResult(null);

    try {
      const result = await orderops.parseMessage(token, messageId, conversationId);
      setParseResult({ id: messageId, success: result.success, data: result.result });
    } catch (error: any) {
      setParseResult({ id: messageId, success: false, data: error.message });
    } finally {
      setParsingId(null);
    }
  };

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

              {/* Image preview */}
              {message.media_url && message.content_type === 'image' && (
                <img
                  src={message.media_url}
                  alt="Image"
                  className="rounded-lg mb-2"
                  style={{ maxWidth: '220px', maxHeight: '220px', objectFit: 'contain' }}
                />
              )}

              {/* Sticker preview - smaller size */}
              {message.media_url && message.content_type === 'sticker' && (
                <img
                  src={message.media_url}
                  alt="Sticker"
                  className="mb-1"
                  style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain' }}
                />
              )}

              {/* Audio/Voice note player */}
              {message.media_url && message.content_type === 'audio' && (
                <audio
                  controls
                  src={message.media_url}
                  className="mb-2"
                  style={{ maxWidth: '200px', height: '36px' }}
                />
              )}

              {/* Video player */}
              {message.media_url && message.content_type === 'video' && (
                <video
                  controls
                  src={message.media_url}
                  className="rounded-lg mb-2"
                  style={{ maxWidth: '220px', maxHeight: '180px', objectFit: 'contain' }}
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

              {/* OrderOps button - for any text message with sufficient content */}
              {message.content_type === 'text' && message.content && message.content.length > 20 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  {parseResult?.id === message.id ? (
                    <div className={`text-xs ${parseResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {parseResult.success ? (
                        <div className="space-y-1">
                          <div className="font-medium">✓ {parseResult.data?.order_code || parseResult.data?.mother_order_code || 'Order'} created</div>
                          {parseResult.data?.type && (
                            <div className="text-gray-500">Type: {parseResult.data.type}</div>
                          )}
                          {parseResult.data?.message && (
                            <div className="text-gray-500">{parseResult.data.message}</div>
                          )}
                        </div>
                      ) : (
                        <div>✗ {parseResult.data?.message || parseResult.data || 'Failed'}</div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSendToOrderOps(message.id)}
                      disabled={parsingId === message.id}
                      className="flex items-center space-x-1 text-xs text-purple-600 hover:text-purple-700 disabled:text-gray-400"
                    >
                      {parsingId === message.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Parsing...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          <span>Send to OrderOps</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
