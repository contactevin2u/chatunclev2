'use client';

import { Conversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No conversations yet</p>
        <p className="text-sm mt-1">Messages will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          onClick={() => onSelect(conversation)}
          className={clsx(
            'w-full px-3 md:px-4 py-3 md:py-3 flex items-start space-x-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left',
            selectedId === conversation.id && 'bg-gray-100'
          )}
        >
          {/* Avatar */}
          <div className="flex-shrink-0 w-11 h-11 md:w-12 md:h-12 bg-gray-300 rounded-full flex items-center justify-center text-white font-medium text-sm md:text-base">
            {conversation.contact_name?.charAt(0).toUpperCase() ||
              conversation.contact_phone?.charAt(0) ||
              '?'}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 truncate text-sm md:text-base">
                {conversation.contact_name || conversation.contact_phone || 'Unknown'}
              </h3>
              {conversation.last_message_at && (
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {formatDistanceToNow(new Date(conversation.last_message_at), {
                    addSuffix: false,
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-0.5 md:mt-1">
              <p className="text-xs md:text-sm text-gray-500 truncate">
                {conversation.last_message || 'No messages'}
              </p>
              {conversation.unread_count > 0 && (
                <span className="ml-2 flex-shrink-0 bg-whatsapp-dark text-white text-xs font-medium min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full">
                  {conversation.unread_count}
                </span>
              )}
            </div>

            {/* Labels display */}
            {conversation.labels && conversation.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {conversation.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] md:text-xs"
                    style={{ backgroundColor: label.color + '20', color: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
                {conversation.labels.length > 3 && (
                  <span className="text-[10px] md:text-xs text-gray-400">
                    +{conversation.labels.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Account indicator */}
            {conversation.account_name && (
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 truncate">
                via {conversation.account_name}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
