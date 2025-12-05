export interface User {
  id: string;
  email: string;
  name: string;
  role: 'agent' | 'admin';
  created_at: string;
}

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  phone_number: string | null;
  name: string | null;
  status: 'connected' | 'disconnected' | 'qr_pending';
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  whatsapp_account_id: string;
  wa_id: string;
  name: string | null;
  phone_number: string | null;
  profile_pic_url: string | null;
  labels?: Label[];
  created_at: string;
  updated_at: string;
}

export interface Label {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  whatsapp_account_id: string;
  contact_id: string;
  last_message_at: string | null;
  unread_count: number;
  contact_name: string | null;
  contact_phone: string | null;
  profile_pic_url: string | null;
  account_name: string | null;
  last_message: string | null;
  labels?: Label[];
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  shortcut: string | null;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Extended WhatsApp Account with new settings
export interface WhatsAppAccountExtended extends WhatsAppAccount {
  incognito_mode?: boolean;
  show_channel_name?: boolean;
  channel_display_name?: string | null;
}

// Scheduled Message
export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  agent_id: string;
  content_type: string;
  content: string;
  media_url: string | null;
  media_mime_type: string | null;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  contact_name?: string;
  contact_phone?: string;
}

// Internal Note
export interface InternalNote {
  id: string;
  conversation_id: string;
  agent_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  agent_name?: string;
}

// Auto-Reply Rule
export interface AutoReplyRule {
  id: string;
  user_id: string;
  whatsapp_account_id: string | null;
  name: string;
  trigger_type: 'keyword' | 'regex' | 'all';
  trigger_keywords: string[] | null;
  trigger_regex: string | null;
  response_type: 'text' | 'template';
  response_content: string | null;
  response_template_id: string | null;
  use_ai: boolean;
  ai_prompt: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  template_name?: string;
  account_name?: string;
}

// Agent Activity Log
export interface ActivityLog {
  id: string;
  agent_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  agent_name?: string;
}

// Analytics Types
export interface AnalyticsOverview {
  total_conversations: number;
  total_messages: number;
  messages_sent: number;
  messages_received: number;
  response_rate: number;
  avg_response_time_ms: number;
  auto_replies: number;
}

export interface AgentStats {
  agent_id: string;
  agent_name: string;
  messages_sent: number;
  conversations_handled: number;
  avg_response_time_ms: number;
  auto_replies: number;
}

export interface DayStats {
  date: string;
  messages_sent: number;
  messages_received: number;
  conversations: number;
}

export interface HourlyStats {
  hour: number;
  messages: number;
}

// Anti-Ban Stats
export interface AntiBanStats {
  accountAgeDays: number;
  isWarmupPeriod: boolean;
  dailyLimit: number;
  dailyNewContactsSent: number;
  messagesLastMinute: number;
  batchCount: number;
  rateStatus: 'safe' | 'caution' | 'warning';
}

// Search Result
export interface SearchResult {
  type: 'contact' | 'message';
  id: string;
  content: string;
  highlight: string;
  conversation_id?: string;
  contact_name?: string;
  contact_phone?: string;
  created_at: string;
}
