'use client';

import { useState } from 'react';
import { Conversation, GroupAccount } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation, selectedAccountConversationId?: string) => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Toggle group expansion
  const toggleGroupExpanded = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Get unread count - handles both regular and unified groups
  const getUnreadCount = (conv: Conversation) => {
    if (conv.is_unified_group && conv.total_unread !== undefined) {
      return conv.total_unread;
    }
    return conv.unread_count || 0;
  };

  // Check if this conversation or any of its accounts is selected
  const isSelected = (conv: Conversation) => {
    if (selectedId === conv.id) return true;
    if (conv.is_unified_group && conv.accounts) {
      return conv.accounts.some(acc => acc.conversation_id === selectedId);
    }
    return false;
  };

  return (
    <div className="divide-y divide-gray-100">
      {conversations.map((conversation) => {
        const isUnifiedGroup = conversation.is_unified_group && conversation.accounts && conversation.accounts.length > 1;
        const isExpanded = isUnifiedGroup && expandedGroups.has(conversation.id);
        const unreadCount = getUnreadCount(conversation);

        return (
          <div key={conversation.id}>
            {/* Main conversation item */}
            <button
              onClick={() => {
                if (isUnifiedGroup) {
                  // For unified groups, select the default conversation
                  onSelect(conversation, conversation.default_conversation_id);
                } else {
                  onSelect(conversation);
                }
              }}
              className={clsx(
                'w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-start space-x-2.5 sm:space-x-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left',
                isSelected(conversation) && 'bg-gray-100'
              )}
            >
              {/* Avatar */}
              <div className={clsx(
                'flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white font-medium text-sm md:text-base relative',
                conversation.is_group ? 'bg-blue-500' : 'bg-gray-300'
              )}>
                {conversation.is_group ? (
                  <Users className="w-5 h-5 md:w-6 md:h-6" />
                ) : (
                  getAvatarInitial(conversation)
                )}
                {/* Account count badge for unified groups */}
                {isUnifiedGroup && (
                  <span className="absolute -bottom-0.5 -right-0.5 bg-purple-600 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full">
                    {conversation.account_count}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    {/* Expand/collapse button for unified groups */}
                    {isUnifiedGroup && (
                      <button
                        onClick={(e) => toggleGroupExpanded(conversation.id, e)}
                        className="flex-shrink-0 p-1 sm:p-0.5 hover:bg-gray-200 rounded touch-manipulation"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-gray-500" />
                        )}
                      </button>
                    )}
                    <h3 className="font-medium text-gray-900 truncate text-sm md:text-base">
                      {getDisplayName(conversation)}
                    </h3>
                    {/* Group indicator badge */}
                    {conversation.is_group && !isUnifiedGroup && (
                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                        Group
                      </span>
                    )}
                    {/* Unified group badge */}
                    {isUnifiedGroup && (
                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">
                        {conversation.account_count} accounts
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
                  {unreadCount > 0 && (
                    <span className="ml-2 flex-shrink-0 bg-whatsapp-dark text-white text-xs font-medium min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>

                {/* Participant count for groups */}
                {conversation.is_group && conversation.participant_count && !isUnifiedGroup && (
                  <p className="text-[10px] md:text-xs text-gray-400 mt-0.5">
                    {conversation.participant_count} participants
                  </p>
                )}

                {/* Last message account for unified groups */}
                {isUnifiedGroup && conversation.last_message_account && (
                  <p className="text-[10px] md:text-xs text-purple-500 mt-0.5">
                    via {conversation.last_message_account}
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

                {/* Account indicator (only for non-unified groups) */}
                {!isUnifiedGroup && conversation.account_name && (
                  <p className="text-[10px] md:text-xs text-gray-400 mt-1 truncate">
                    via {conversation.account_name}
                  </p>
                )}
              </div>
            </button>

            {/* Expanded account list for unified groups */}
            {isUnifiedGroup && isExpanded && conversation.accounts && (
              <div className="bg-gray-50 border-l-2 border-purple-300 ml-3 sm:ml-4">
                {conversation.accounts.map((account: GroupAccount) => (
                  <button
                    key={account.conversation_id}
                    onClick={() => onSelect(conversation, account.conversation_id)}
                    className={clsx(
                      'w-full px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between hover:bg-gray-100 transition-colors text-left',
                      selectedId === account.conversation_id && 'bg-purple-50'
                    )}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">
                        {account.account_name || 'Unknown Account'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {account.last_message_at && (
                        <span className="text-[10px] text-gray-400">
                          {formatDistanceToNow(new Date(account.last_message_at), { addSuffix: false })}
                        </span>
                      )}
                      {account.unread_count > 0 && (
                        <span className="bg-purple-600 text-white text-[10px] font-medium min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full">
                          {account.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
