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
            'w-full px-4 py-3 flex items-start space-x-3 hover:bg-gray-50 transition-colors text-left',
            selectedId === conversation.id && 'bg-gray-100'
          )}
        >
          {/* Avatar */}
          <div className="flex-shrink-0 w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-white font-medium">
            {conversation.contact_name?.charAt(0).toUpperCase() ||
              conversation.contact_phone?.charAt(0) ||
              '?'}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 truncate">
                {conversation.contact_name || conversation.contact_phone || 'Unknown'}
              </h3>
              {conversation.last_message_at && (
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(conversation.last_message_at), {
                    addSuffix: false,
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-1">
              <p className="text-sm text-gray-500 truncate">
                {conversation.last_message || 'No messages'}
              </p>
              {conversation.unread_count > 0 && (
                <span className="ml-2 bg-whatsapp-light text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  {conversation.unread_count}
                </span>
              )}
            </div>

            {/* Account indicator */}
            {conversation.account_name && (
              <p className="text-xs text-gray-400 mt-1 truncate">
                via {conversation.account_name}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
