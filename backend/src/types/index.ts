export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'agent' | 'admin';
  created_at: Date;
  updated_at: Date;
}

// Channel types supported by the unified accounts table
export type ChannelType = 'whatsapp' | 'telegram' | 'tiktok' | 'instagram' | 'messenger';

// Unified Account type (replaces WhatsAppAccount)
export interface Account {
  id: string;
  user_id: string;
  channel_type: ChannelType;
  channel_identifier: string | null; // Phone number, bot username, page ID, etc.
  phone_number: string | null; // Legacy field for WhatsApp
  name: string | null;
  session_data: object | null; // WhatsApp session data
  credentials: object | null; // Tokens for other channels
  settings: object | null; // Channel-specific settings
  status: 'connected' | 'disconnected' | 'qr_pending' | 'error';
  incognito_mode: boolean;
  show_channel_name: boolean;
  channel_display_name: string | null;
  last_connected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Backward compatibility alias
export type WhatsAppAccount = Account;

export interface Contact {
  id: string;
  account_id: string;
  wa_id: string;
  name: string | null;
  phone_number: string | null;
  profile_pic_url: string | null;
  channel_type: ChannelType;
  // Channel-specific IDs
  telegram_user_id: number | null;
  tiktok_user_id: string | null;
  instagram_user_id: string | null;
  messenger_user_id: string | null;
  jid_type: 'pn' | 'lid';
  created_at: Date;
  updated_at: Date;
}

export interface Label {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: Date;
}

export interface Conversation {
  id: string;
  account_id: string;
  contact_id: string | null;
  last_message_at: Date | null;
  unread_count: number;
  first_response_at: Date | null;
  assigned_agent_id: string | null;
  channel_type: ChannelType;
  // Group fields
  is_group: boolean;
  group_id: string | null;
  // Channel-specific conversation IDs
  telegram_chat_id: number | null;
  tiktok_conversation_id: string | null;
  instagram_conversation_id: string | null;
  messenger_conversation_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  sender_type: 'agent' | 'contact';
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location';
  content: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  agent_id: string | null;
  is_auto_reply: boolean;
  response_time_ms: number | null;
  channel_type: ChannelType;
  // Group message fields
  sender_jid: string | null;
  sender_name: string | null;
  // Reactions
  reactions: object | null;
  // Edited message tracking
  is_edited: boolean;
  edited_at: Date | null;
  // Quoted message fields
  quoted_message_id: string | null;
  quoted_wa_message_id: string | null;
  quoted_content: string | null;
  quoted_sender_name: string | null;
  // Raw message for forwarding
  raw_message: object | null;
  created_at: Date;
  updated_at: Date;
}

export interface Template {
  id: string;
  user_id: string | null;
  account_id: string | null;
  name: string;
  content: string;
  shortcut: string | null;
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  media_url: string | null;
  media_mime_type: string | null;
  created_at: Date;
}

export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  agent_id: string;
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content: string;
  media_url: string | null;
  media_mime_type: string | null;
  scheduled_at: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface InternalNote {
  id: string;
  conversation_id: string;
  agent_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface AutoReplyRule {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  trigger_type: 'keyword' | 'regex' | 'all';
  trigger_keywords: string[] | null;
  trigger_regex: string | null;
  response_type: 'text' | 'template' | 'ai';
  response_content: string | null;
  response_template_id: string | null;
  use_ai: boolean;
  ai_prompt: string | null;
  is_active: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

export interface AgentActivityLog {
  id: string;
  agent_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: object | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface AalyxOrder {
  id: string;
  conversation_id: string;
  contact_id: string;
  aalyx_order_id: string | null;
  order_reference: string | null;
  total_amount: number | null;
  currency: string;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  payment_due_date: Date | null;
  last_reminder_sent: Date | null;
  reminder_count: number;
  order_data: object | null;
  created_at: Date;
  updated_at: Date;
}

export interface AIConversationContext {
  id: string;
  conversation_id: string;
  system_prompt: string | null;
  business_context: string | null;
  conversation_summary: string | null;
  last_updated: Date;
}

export interface Analytics {
  total_messages_sent: number;
  total_messages_received: number;
  total_conversations: number;
  avg_response_time_ms: number;
  first_response_time_avg_ms: number;
  response_rate: number;
  messages_by_agent: { agent_id: string; agent_name: string; count: number }[];
  messages_by_day: { date: string; sent: number; received: number }[];
  auto_reply_count: number;
}

export interface Group {
  id: string;
  account_id: string;
  group_jid: string;
  name: string | null;
  description: string | null;
  owner_jid: string | null;
  participant_count: number;
  profile_pic_url: string | null;
  creation_timestamp: Date | null;
  is_announce: boolean;
  is_restrict: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AccountAccess {
  id: string;
  account_id: string;
  agent_id: string;
  permission: 'full' | 'send' | 'view';
  granted_by: string | null;
  granted_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'agent' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
