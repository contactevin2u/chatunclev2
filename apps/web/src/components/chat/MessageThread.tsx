'use client';

import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Message } from '@/stores/messages';
import { MessageBubble } from './MessageBubble';
import clsx from 'clsx';

interface MessageThreadProps {
  messages: Message[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MessageThread({ messages, onLoadMore, hasMore }: MessageThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin bg-gray-50">
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full text-center text-sm text-primary-600 hover:text-primary-700 py-2"
        >
          Load earlier messages
        </button>
      )}

      {groupedMessages.map(({ date, messages: dayMessages }) => (
        <div key={date}>
          {/* Date separator */}
          <div className="flex items-center justify-center my-4">
            <span className="px-3 py-1 text-xs text-gray-500 bg-white rounded-full shadow-sm">
              {date}
            </span>
          </div>

          {/* Messages for this date */}
          <div className="space-y-2">
            {dayMessages.map((message, index) => {
              const prevMessage = dayMessages[index - 1];
              const showSender =
                !prevMessage ||
                prevMessage.senderType !== message.senderType ||
                (prevMessage.senderName !== message.senderName &&
                  message.senderType === 'contact');

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  showSender={showSender}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

interface GroupedMessages {
  date: string;
  messages: Message[];
}

function groupMessagesByDate(messages: Message[]): GroupedMessages[] {
  const groups: Map<string, Message[]> = new Map();

  messages.forEach((message) => {
    const date = format(new Date(message.createdAt), 'MMMM d, yyyy');
    const existing = groups.get(date) || [];
    existing.push(message);
    groups.set(date, existing);
  });

  return Array.from(groups.entries()).map(([date, messages]) => ({
    date,
    messages,
  }));
}
