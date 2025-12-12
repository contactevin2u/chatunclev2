/**
 * Multi-Channel Types
 * Shared types for all channel adapters
 */

export type ChannelType = 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'tiktok';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'qr_pending';

export interface ChannelAccount {
  id: string;
  userId: string;
  channelType: ChannelType;
  channelIdentifier: string;  // Phone number, bot username, page ID, etc.
  accountName: string;
  status: ConnectionStatus;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  lastConnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagePayload {
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker';
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  replyToMessageId?: string;
}

export interface IncomingMessage {
  channelType: ChannelType;
  channelAccountId: string;
  channelMessageId: string;
  chatId: string;           // Channel-specific chat/conversation ID
  senderId: string;         // Channel-specific sender ID
  senderName?: string;
  senderProfilePic?: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker';
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  groupName?: string;
  rawMessage?: any;         // Original message object from channel
  // Reply context (for messages that are replies to other messages)
  replyToMessageId?: string;      // Channel-specific message ID being replied to
  replyToContent?: string;        // Content/preview of the replied-to message
  replyToSenderName?: string;     // Name of the sender of the replied-to message
}

export interface ContactProfile {
  channelUserId: string;
  displayName?: string;
  username?: string;
  profilePicUrl?: string;
  phoneNumber?: string;
  metadata?: Record<string, any>;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelCredentials {
  // WhatsApp: handled separately via Baileys
  // Telegram
  botToken?: string;
  // Instagram/Messenger (Meta)
  pageAccessToken?: string;
  pageId?: string;
  appSecret?: string;
  // TikTok
  accessToken?: string;
  shopId?: string;
}
