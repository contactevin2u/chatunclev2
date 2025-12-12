'use client';

import { formatDistanceToNow } from 'date-fns';
import { Conversation } from '@/stores/conversations';
import { ChannelIcon } from '@/components/channel/ChannelIcon';
import clsx from 'clsx';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  // Sort by last message time
  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {sorted.length === 0 ? (
        <div className="p-4 text-center text-gray-500 text-sm">No conversations yet</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {sorted.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={conversation.id === selectedId}
              onSelect={() => onSelect(conversation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
}

function ConversationItem({ conversation, isSelected, onSelect }: ConversationItemProps) {
  const name = conversation.isGroup
    ? conversation.group?.name
    : conversation.contact?.name || conversation.contact?.phoneNumber || 'Unknown';

  const profilePic = conversation.isGroup
    ? conversation.group?.profilePicUrl
    : conversation.contact?.profilePicUrl;

  const lastMessage = conversation.lastMessage;
  const lastMessagePreview = lastMessage
    ? lastMessage.contentType === 'text'
      ? lastMessage.content || ''
      : `[${lastMessage.contentType}]`
    : '';

  const timeAgo = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
    : '';

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left',
        isSelected && 'bg-primary-50 hover:bg-primary-50'
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative">
        {profilePic ? (
          <img src={profilePic} alt={name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
            {name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5">
          <ChannelIcon type={conversation.channelType} size={16} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-900 truncate">{name}</p>
          {timeAgo && <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo}</span>}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-gray-500 truncate">{lastMessagePreview}</p>
          {conversation.unreadCount > 0 && (
            <span className="ml-2 flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary-600 text-white text-xs font-medium">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
