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
  created_at: Date;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  shortcut: string | null;
  created_at: Date;
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
