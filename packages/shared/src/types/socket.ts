import type { ChannelType, ContentType, Message, MessageStatus } from './index.js';

// ============================================
// SERVER → CLIENT EVENTS
// ============================================

export interface NewMessageEvent {
  accountId: string;
  conversationId: string;
  channelType: ChannelType;
  message: {
    id: string;
    tempId?: string; // For optimistic UI matching
    senderType: 'agent' | 'contact' | 'system';
    contentType: ContentType;
    content?: string;
    mediaUrl?: string;
    timestamp: string;
    status: MessageStatus;
    senderName?: string;
    quotedContent?: string;
    quotedSenderName?: string;
  };
  contact?: {
    id: string;
    name: string;
    profilePicUrl?: string;
  };
  _source: 'self' | 'other' | 'incoming'; // Critical for deduplication
}

export interface MessageSentEvent {
  tempId: string; // Client's temporary ID
  message: Message; // Saved message with real ID
}

export interface MessageStatusEvent {
  messageId: string;
  channelMessageId?: string;
  status: MessageStatus;
  error?: string;
  timestamp: string;
}

export interface MessageReactionEvent {
  messageId: string;
  conversationId: string;
  reaction: string;
  reactorJid: string;
  reactorName?: string;
  timestamp: string;
}

export interface MessageEditedEvent {
  messageId: string;
  conversationId: string;
  newContent: string;
  editedAt: string;
}

export interface TypingEvent {
  conversationId: string;
  accountId: string;
  userId?: string;
  userName?: string;
  isTyping: boolean;
}

export interface AccountStatusEvent {
  accountId: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_required' | 'error';
  error?: string;
}

export interface QRUpdateEvent {
  accountId: string;
  qrCode: string;
  expiresAt: string;
}

export interface PairingCodeEvent {
  accountId: string;
  pairingCode: string;
  expiresAt: string;
}

export interface SyncProgressEvent {
  accountId: string;
  type: 'history' | 'contacts' | 'groups';
  progress: number; // 0-100
  total?: number;
  processed?: number;
}

export interface GroupUpdateEvent {
  accountId: string;
  groupId: string;
  update: {
    name?: string;
    description?: string;
    participantCount?: number;
    profilePicUrl?: string;
  };
}

export interface ScheduledMessageResultEvent {
  scheduledMessageId: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

export interface OrderOpsResultEvent {
  conversationId: string;
  orderId?: string;
  status: 'success' | 'failed';
  error?: string;
  data?: Record<string, unknown>;
}

export interface RoomJoinedEvent {
  accountId: string;
}

export interface RoomErrorEvent {
  accountId: string;
  error: string;
}

// ============================================
// CLIENT → SERVER EVENTS
// ============================================

export interface JoinAccountData {
  accountId: string;
}

export interface LeaveAccountData {
  accountId: string;
}

export interface TypingStartData {
  accountId: string;
  conversationId: string;
}

export interface TypingStopData {
  accountId: string;
  conversationId: string;
}

export interface SendMessageData {
  accountId: string;
  conversationId: string;
  tempId: string;
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
  quotedMessageId?: string;
}

// ============================================
// TYPED SOCKET INTERFACES
// ============================================

export interface ServerToClientEvents {
  // Messages
  'message:new': (data: NewMessageEvent) => void;
  'message:sent': (data: MessageSentEvent) => void;
  'message:status': (data: MessageStatusEvent) => void;
  'message:reaction': (data: MessageReactionEvent) => void;
  'message:edited': (data: MessageEditedEvent) => void;

  // Typing
  'typing:update': (data: TypingEvent) => void;

  // Account
  'account:status': (data: AccountStatusEvent) => void;
  'qr:update': (data: QRUpdateEvent) => void;
  'pairing:code': (data: PairingCodeEvent) => void;

  // Sync
  'sync:progress': (data: SyncProgressEvent) => void;

  // Groups
  'group:update': (data: GroupUpdateEvent) => void;

  // Scheduled messages
  'scheduled:result': (data: ScheduledMessageResultEvent) => void;

  // OrderOps
  'orderops:result': (data: OrderOpsResultEvent) => void;

  // Rooms
  'room:joined': (data: RoomJoinedEvent) => void;
  'room:error': (data: RoomErrorEvent) => void;
}

export interface ClientToServerEvents {
  // Room management
  'join:account': (data: JoinAccountData) => void;
  'leave:account': (data: LeaveAccountData) => void;

  // Typing indicators
  'typing:start': (data: TypingStartData) => void;
  'typing:stop': (data: TypingStopData) => void;

  // Messages (optional - can also use REST API)
  'message:send': (data: SendMessageData) => void;
}

export interface InterServerEvents {
  // For Socket.io adapter (Redis) if scaling horizontally
  ping: () => void;
}

export interface SocketData {
  userId: string;
  userName: string;
  accountIds: string[]; // Accounts user has access to
}
