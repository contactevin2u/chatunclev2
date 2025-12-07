'use client';

import { Conversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Users } from 'lucide-react';

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

  // Get display name for conversation (works for both 1:1 and groups)
  const getDisplayName = (conv: Conversation) => {
    if (conv.is_group) {
      return conv.group_name || conv.display_name || 'Group';
    }
    return conv.display_name || conv.contact_name || conv.contact_phone || 'Unknown';
  };

  // Get avatar initial
  const getAvatarInitial = (conv: Conversation) => {
    const name = getDisplayName(conv);
    return name.charAt(0).toUpperCase();
  };

  // Get last message preview with sender name for groups
  const getLastMessagePreview = (conv: Conversation) => {
    if (!conv.last_message) return 'No messages';
    if (conv.is_group && conv.last_message_sender) {
      return `${conv.last_message_sender}: ${conv.last_message}`;
    }
    return conv.last_message;
  };

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
          <div className={clsx(
            'flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white font-medium text-sm md:text-base relative',
            conversation.is_group ? 'bg-blue-500' : 'bg-gray-300'
          )}>
            {conversation.is_group ? (
              <Users className="w-5 h-5 md:w-6 md:h-6" />
            ) : (
              getAvatarInitial(conversation)
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 min-w-0">
                <h3 className="font-medium text-gray-900 truncate text-sm md:text-base">
                  {getDisplayName(conversation)}
                </h3>
                {/* Group indicator badge */}
                {conversation.is_group && (
                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                    Group
                  </span>
                )}
              </div>
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
                {getLastMessagePreview(conversation)}
              </p>
              {conversation.unread_count > 0 && (
                <span className="ml-2 flex-shrink-0 bg-whatsapp-dark text-white text-xs font-medium min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full">
                  {conversation.unread_count}
                </span>
              )}
            </div>

            {/* Participant count for groups */}
            {conversation.is_group && conversation.participant_count && (
              <p className="text-[10px] md:text-xs text-gray-400 mt-0.5">
                {conversation.participant_count} participants
              </p>
            )}

            {/* Labels display (only for 1:1 conversations) */}
            {!conversation.is_group && conversation.labels && conversation.labels.length > 0 && (
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
