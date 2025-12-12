// Core channel types
export type ChannelType = 'whatsapp' | 'telegram' | 'tiktok' | 'instagram' | 'messenger';

export type MessageStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location';

export type SenderType = 'agent' | 'contact' | 'system';

export type AccountStatus = 'connected' | 'connecting' | 'disconnected' | 'qr_required' | 'error';

export type AccountRole = 'owner' | 'admin' | 'agent';

export type JidType = 'user' | 'group' | 'broadcast' | 'newsletter';

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

// Account types
export interface Account {
  id: string;
  userId: string;
  channelType: ChannelType;
  channelIdentifier: string;
  phoneNumber?: string;
  status: AccountStatus;
  settings?: AccountSettings;
  incognitoMode: boolean;
  lastConnectedAt?: Date;
  createdAt: Date;
}

export interface AccountSettings {
  autoReplyEnabled?: boolean;
  welcomeMessage?: string;
  awayMessage?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
}

export interface AccountAccess {
  accountId: string;
  agentId: string;
  role: AccountRole;
  createdAt: Date;
}

// Contact types
export interface Contact {
  id: string;
  accountId: string;
  channelType: ChannelType;
  channelContactId: string;
  name?: string;
  phoneNumber?: string;
  profilePicUrl?: string;
  jidType?: JidType;
  // Channel-specific IDs
  waId?: string;
  telegramUserId?: string;
  tiktokUserId?: string;
  instagramUserId?: string;
  messengerUserId?: string;
  createdAt: Date;
}

// Conversation types
export interface Conversation {
  id: string;
  accountId: string;
  contactId?: string;
  groupId?: string;
  channelType: ChannelType;
  isGroup: boolean;
  lastMessageAt?: Date;
  unreadCount: number;
  firstResponseAt?: Date;
  assignedAgentId?: string;
  // Channel-specific IDs
  telegramChatId?: string;
  tiktokConversationId?: string;
  instagramConversationId?: string;
  messengerConversationId?: string;
  createdAt: Date;
}

// Message types
export interface Message {
  id: string;
  conversationId: string;
  channelMessageId: string;
  channelType: ChannelType;
  senderType: SenderType;
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  status: MessageStatus;
  agentId?: string;
  isAutoReply: boolean;
  responseTimeMs?: number;
  senderJid?: string;
  senderName?: string;
  reactions?: MessageReaction[];
  isEdited: boolean;
  editedAt?: Date;
  quotedMessageId?: string;
  quotedChannelMessageId?: string;
  quotedContent?: string;
  quotedSenderName?: string;
  retryCount: number;
  nextRetryAt?: Date;
  createdAt: Date;
}

export interface MessageReaction {
  emoji: string;
  senderJid: string;
  senderName?: string;
  timestamp: Date;
}

// Group types
export interface Group {
  id: string;
  accountId: string;
  groupJid: string;
  name: string;
  description?: string;
  ownerJid?: string;
  participantCount: number;
  profilePicUrl?: string;
  createdAt: Date;
}

// Template types
export interface Template {
  id: string;
  userId: string;
  name: string;
  content: string;
  category?: string;
  variables?: string[];
  createdAt: Date;
}

// Sequence types
export interface Sequence {
  id: string;
  userId: string;
  name: string;
  steps: SequenceStep[];
  triggerType: 'keyword' | 'new_contact' | 'manual';
  isActive: boolean;
  createdAt: Date;
}

export interface SequenceStep {
  order: number;
  delayMinutes: number;
  contentType: ContentType;
  content: string;
  mediaUrl?: string;
}

// Scheduled message types
export interface ScheduledMessage {
  id: string;
  accountId: string;
  conversationId: string;
  content?: string;
  contentType: ContentType;
  mediaUrl?: string;
  scheduledAt: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt?: Date;
  error?: string;
  createdAt: Date;
}

// Auto-reply types
export interface AutoReplyRule {
  id: string;
  accountId: string;
  triggerKeyword: string;
  responseContent: string;
  matchType: 'exact' | 'contains' | 'starts_with' | 'regex';
  isActive: boolean;
  createdAt: Date;
}

// Knowledge bank types
export interface KnowledgeEntry {
  id: string;
  userId: string;
  title: string;
  content: string;
  category?: string;
  embedding?: number[];
  createdAt: Date;
}

// Notes types
export interface Note {
  id: string;
  contactId: string;
  agentId: string;
  content: string;
  createdAt: Date;
}

// Label types
export interface Label {
  id: string;
  accountId: string;
  name: string;
  color: string;
  createdAt: Date;
}

// LID/PN mapping for WhatsApp v7
export interface LidPnMapping {
  id: string;
  accountId: string;
  lid: string;
  pn: string;
  createdAt: Date;
}

// Re-export all types
export * from './socket.js';
export * from './messages.js';
export * from './accounts.js';
export * from './errors.js';
export * from './webhooks.js';
export * from './conversations.js';
