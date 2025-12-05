export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'agent' | 'admin';
  created_at: Date;
  updated_at: Date;
}

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  phone_number: string | null;
  name: string | null;
  session_data: object | null;
  status: 'connected' | 'disconnected' | 'qr_pending';
  incognito_mode: boolean;
  show_channel_name: boolean;
  channel_display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Contact {
  id: string;
  whatsapp_account_id: string;
  wa_id: string;
  name: string | null;
  phone_number: string | null;
  profile_pic_url: string | null;
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
  whatsapp_account_id: string;
  contact_id: string;
  last_message_at: Date | null;
  unread_count: number;
  first_response_at: Date | null;
  assigned_agent_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  sender_type: 'agent' | 'contact';
  content_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  agent_id: string | null;
  is_auto_reply: boolean;
  response_time_ms: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  shortcut: string | null;
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
  whatsapp_account_id: string | null;
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
