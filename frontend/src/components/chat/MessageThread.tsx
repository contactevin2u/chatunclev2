'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/types';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Check, CheckCheck, Clock, Image, Video, FileText, Mic, AlertCircle, Send, Loader2, X, Package, Smile, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { orderops, messages as messagesApi } from '@/lib/api';
import { MessageReaction } from '@/types';

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
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReaction[]>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Common reaction emojis (WhatsApp style)
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // Handle sending a reaction
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!token) return;

    setReactingMessageId(messageId);
    setEmojiPickerMessageId(null);

    try {
      const result = await messagesApi.react(token, messageId, emoji);
      if (result.success) {
        setMessageReactions(prev => ({
          ...prev,
          [messageId]: result.reactions,
        }));
      }
    } catch (error) {
      console.error('Failed to react:', error);
    } finally {
      setReactingMessageId(null);
    }
  };

  // Remove reaction
  const handleRemoveReaction = async (messageId: string) => {
    if (!token) return;

    setReactingMessageId(messageId);

    try {
      const result = await messagesApi.react(token, messageId, '');
      if (result.success) {
        setMessageReactions(prev => ({
          ...prev,
          [messageId]: result.reactions,
        }));
      }
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    } finally {
      setReactingMessageId(null);
    }
  };

  // Get reactions for a message (from local state or message data)
  const getReactions = (message: Message): MessageReaction[] => {
    return messageReactions[message.id] || message.reactions || [];
  };

  // Group reactions by emoji
  const groupReactions = (reactions: MessageReaction[]) => {
    const grouped: Record<string, { emoji: string; count: number; senders: string[] }> = {};
    reactions.forEach(r => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { emoji: r.emoji, count: 0, senders: [] };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].senders.push(r.sender);
    });
    return Object.values(grouped);
  };

  // Open confirmation modal
  const handleRequestOrderOps = (messageId: string, content: string) => {
    setConfirmModal({ isOpen: true, messageId, content });
  };

  // Close confirmation modal
  const handleCloseModal = () => {
    if (parsingId) return; // Don't close while loading
    setConfirmModal({ isOpen: false, messageId: '', content: '' });
  };

  // Confirmed - send to OrderOps (async - returns immediately)
  const handleConfirmSend = async () => {
    if (!token || !conversationId) return;

    const { messageId } = confirmModal;
    setParsingId(messageId);
    setParseResult(null);

    try {
      const result = await orderops.parseMessage(token, messageId, conversationId) as any;

      if (result.processing) {
        // Async processing - close modal, result will come via socket
        setParseResult({ id: messageId, success: true, data: { processing: true } });
      } else if (result.success) {
        // Immediate success (shouldn't happen with new async flow, but handle anyway)
        setParseResult({ id: messageId, success: true, data: result.result });
      }

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
      case 'location':
        return <MapPin className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // Parse location data from message content
  const parseLocationData = (content: string | null): { latitude: number; longitude: number; name?: string; address?: string } | null => {
    if (!content) return null;
    try {
      // Try to parse as JSON (new format)
      const data = JSON.parse(content);
      if (data.latitude && data.longitude) {
        return data;
      }
    } catch {
      // Try to parse old format: [Location: lat, lng]
      const match = content.match(/\[Location:\s*([-\d.]+),\s*([-\d.]+)\]/);
      if (match) {
        return {
          latitude: parseFloat(match[1]),
          longitude: parseFloat(match[2]),
        };
      }
    }
    return null;
  };

  // Generate OpenStreetMap static image URL
  const getMapPreviewUrl = (lat: number, lng: number, zoom: number = 15) => {
    // Using OpenStreetMap static map service
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=200x150&markers=${lat},${lng},red`;
  };

  // Generate Google Maps link
  const getGoogleMapsUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  return (
    <div className="space-y-2">
      {messages.map((message) => {
        const isSent = message.sender_type === 'agent';

        return (
          <div
            key={message.id}
            className={clsx('flex group', isSent ? 'justify-end' : 'justify-start')}
          >
            {/* Reaction button - left side for sent messages */}
            {isSent && message.wa_message_id && (
              <div className="relative self-center mr-1">
                <button
                  onClick={() => setEmojiPickerMessageId(emojiPickerMessageId === message.id ? null : message.id)}
                  className="p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="React"
                >
                  <Smile className="h-4 w-4 text-gray-400" />
                </button>
                {/* Emoji picker popup */}
                {emojiPickerMessageId === message.id && (
                  <div className="absolute bottom-full right-0 mb-1 bg-white rounded-lg shadow-lg border p-1.5 flex gap-0.5 z-10">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(message.id, emoji)}
                        disabled={reactingMessageId === message.id}
                        className="p-1.5 hover:bg-gray-100 rounded text-lg transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div
              className={clsx(
                'max-w-[85%] sm:max-w-[75%] md:max-w-[70%] px-3 py-2 shadow-sm relative',
                isSent ? 'chat-bubble-sent' : 'chat-bubble-received'
              )}
            >
              {/* Agent name for sent messages */}
              {isSent && message.agent_name && (
                <p className="text-xs font-medium text-emerald-600 mb-1">
                  {message.agent_name}
                  {message.is_auto_reply && (
                    <span className="ml-1 text-gray-400 font-normal">(auto)</span>
                  )}
                </p>
              )}

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
                  preload="auto"
                  src={message.media_url}
                  className="mb-2 w-full max-w-[200px] h-9"
                  style={{ minWidth: '180px' }}
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

              {/* Location preview */}
              {message.content_type === 'location' && (() => {
                const locationData = parseLocationData(message.content);
                if (!locationData) return null;
                return (
                  <a
                    href={getGoogleMapsUrl(locationData.latitude, locationData.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-2 group/map"
                  >
                    <div className="relative rounded-lg overflow-hidden border border-gray-200">
                      <img
                        src={getMapPreviewUrl(locationData.latitude, locationData.longitude)}
                        alt="Location"
                        className="w-[200px] h-[150px] object-cover"
                        onError={(e) => {
                          // Fallback if static map fails
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/map:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="absolute bottom-2 left-2 right-2 bg-white/90 rounded px-2 py-1">
                          <div className="flex items-center gap-1 text-xs text-gray-700">
                            <MapPin className="h-3 w-3 text-red-500" />
                            <span className="truncate">
                              {locationData.name || locationData.address || `${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-blue-500 mt-1 group-hover/map:underline">Open in Google Maps</p>
                  </a>
                );
              })()}

              {/* Content (skip for location messages as they render their own UI) */}
              {message.content && message.content_type !== 'location' && (
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

              {/* Reactions display */}
              {(() => {
                const reactions = getReactions(message);
                const grouped = groupReactions(reactions);
                if (grouped.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1 mt-1.5 -mb-1">
                    {grouped.map((group) => (
                      <button
                        key={group.emoji}
                        onClick={() => {
                          // If user already reacted with this emoji, remove it
                          const hasMyReaction = group.senders.includes('me');
                          if (hasMyReaction) {
                            handleRemoveReaction(message.id);
                          } else {
                            handleReaction(message.id, group.emoji);
                          }
                        }}
                        disabled={reactingMessageId === message.id}
                        className={clsx(
                          'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs',
                          'bg-gray-100 hover:bg-gray-200 transition-colors',
                          group.senders.includes('me') && 'ring-1 ring-blue-400 bg-blue-50'
                        )}
                        title={group.senders.join(', ')}
                      >
                        <span>{group.emoji}</span>
                        {group.count > 1 && (
                          <span className="ml-0.5 text-gray-600">{group.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* OrderOps button - for any text message with sufficient content */}
              {message.content_type === 'text' && message.content && message.content.length > 20 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  {parseResult?.id === message.id ? (
                    <div className={`text-xs ${parseResult.success ? (parseResult.data?.processing ? 'text-purple-600' : 'text-green-600') : 'text-red-600'}`}>
                      {parseResult.data?.processing ? (
                        <div className="flex items-center space-x-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Processing order... (result will appear as notification)</span>
                        </div>
                      ) : parseResult.success ? (
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
                          <span>Sending...</span>
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
            {/* Reaction button - right side for received messages */}
            {!isSent && message.wa_message_id && (
              <div className="relative self-center ml-1">
                <button
                  onClick={() => setEmojiPickerMessageId(emojiPickerMessageId === message.id ? null : message.id)}
                  className="p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="React"
                >
                  <Smile className="h-4 w-4 text-gray-400" />
                </button>
                {/* Emoji picker popup */}
                {emojiPickerMessageId === message.id && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border p-1.5 flex gap-0.5 z-10">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(message.id, emoji)}
                        disabled={reactingMessageId === message.id}
                        className="p-1.5 hover:bg-gray-100 rounded text-lg transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
