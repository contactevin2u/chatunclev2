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
