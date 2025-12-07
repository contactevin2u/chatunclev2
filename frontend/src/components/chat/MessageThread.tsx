'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/types';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Check, CheckCheck, Clock, Image, Video, FileText, Mic, AlertCircle, Send, Loader2, X, Package } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { orderops } from '@/lib/api';

interface MessageThreadProps {
  messages: Message[];
  conversationId?: string;
  isGroup?: boolean;
}

// Confirmation Modal Component
function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  messagePreview,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  messagePreview: string;
  isLoading: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm sm:max-w-md p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Send to OrderOps</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="mb-5">
          <p className="text-sm text-gray-600 mb-3">
            Are you sure you want to send this message to OrderOps for order parsing?
          </p>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-sm text-gray-700 line-clamp-4 whitespace-pre-wrap">
              {messagePreview}
            </p>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            This will create an order in OrderOps system.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Confirm & Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MessageThread({ messages, conversationId, isGroup = false }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<{ id: string; success: boolean; data?: any } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; messageId: string; content: string }>({
    isOpen: false,
    messageId: '',
    content: '',
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Open confirmation modal
  const handleRequestOrderOps = (messageId: string, content: string) => {
    setConfirmModal({ isOpen: true, messageId, content });
  };

  // Close confirmation modal
  const handleCloseModal = () => {
    if (parsingId) return; // Don't close while loading
    setConfirmModal({ isOpen: false, messageId: '', content: '' });
  };

  // Confirmed - send to OrderOps
  const handleConfirmSend = async () => {
    if (!token || !conversationId) return;

    const { messageId } = confirmModal;
    setParsingId(messageId);
    setParseResult(null);

    try {
      const result = await orderops.parseMessage(token, messageId, conversationId);
      setParseResult({ id: messageId, success: result.success, data: result.result });
      setConfirmModal({ isOpen: false, messageId: '', content: '' });
    } catch (error: any) {
      setParseResult({ id: messageId, success: false, data: error.message });
      setConfirmModal({ isOpen: false, messageId: '', content: '' });
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
                'max-w-[85%] sm:max-w-[75%] md:max-w-[70%] px-3 py-2 shadow-sm',
                isSent ? 'chat-bubble-sent' : 'chat-bubble-received'
              )}
            >
              {/* Sender name for group messages */}
              {isGroup && !isSent && message.sender_name && (
                <p className="text-xs font-medium text-blue-600 mb-1">
                  {message.sender_name}
                </p>
              )}

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
                  className="rounded-lg mb-2 max-w-full sm:max-w-[220px] max-h-[200px] sm:max-h-[220px] object-contain"
                />
              )}

              {/* Sticker preview - smaller size */}
              {message.media_url && message.content_type === 'sticker' && (
                <img
                  src={message.media_url}
                  alt="Sticker"
                  className="mb-1 max-w-[100px] sm:max-w-[120px] max-h-[100px] sm:max-h-[120px] object-contain"
                />
              )}

              {/* Audio/Voice note player */}
              {message.media_url && message.content_type === 'audio' && (
                <audio
                  controls
                  src={message.media_url}
                  className="mb-2 w-full max-w-[200px] h-9"
                />
              )}

              {/* Video player */}
              {message.media_url && message.content_type === 'video' && (
                <video
                  controls
                  src={message.media_url}
                  className="rounded-lg mb-2 max-w-full sm:max-w-[220px] max-h-[160px] sm:max-h-[180px] object-contain"
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
                <span className="text-[10px] sm:text-xs text-gray-500">
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
                      onClick={() => handleRequestOrderOps(message.id, message.content || '')}
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

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmSend}
        messagePreview={confirmModal.content}
        isLoading={parsingId === confirmModal.messageId}
      />
    </div>
  );
}
