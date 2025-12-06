import { pool } from '../config/database';

const migrations = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp accounts table
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(50),
  name VARCHAR(255),
  session_data JSONB,
  status VARCHAR(50) DEFAULT 'disconnected',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  wa_id VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  phone_number VARCHAR(50),
  profile_pic_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(whatsapp_account_id, wa_id)
);

-- Labels table
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#3B82F6',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contact labels junction table
CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(whatsapp_account_id, contact_id)
);

-- Messages table (updated with agent tracking)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  wa_message_id VARCHAR(255),
  sender_type VARCHAR(20) NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  content TEXT,
  media_url TEXT,
  media_mime_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'sent',
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_auto_reply BOOLEAN DEFAULT FALSE,
  response_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster message queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- Templates table (updated with media support)
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  shortcut VARCHAR(50),
  content_type VARCHAR(50) DEFAULT 'text',
  media_url TEXT,
  media_mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Template sequences table (for multi-part templates with delays)
CREATE TABLE IF NOT EXISTS template_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  shortcut VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Template sequence items (individual messages in a sequence)
CREATE TABLE IF NOT EXISTS template_sequence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES template_sequences(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_mime_type VARCHAR(100),
  delay_min_seconds INT DEFAULT 0,
  delay_max_seconds INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_sequence_items_order ON template_sequence_items(sequence_id, order_index);

-- Scheduled messages table
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  media_url TEXT,
  media_mime_type VARCHAR(100),
  scheduled_at TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Internal notes table (visible only to agents)
CREATE TABLE IF NOT EXISTS internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Auto-reply rules table (keyword triggers)
CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'keyword',
  trigger_keywords TEXT[],
  trigger_regex VARCHAR(500),
  response_type VARCHAR(50) NOT NULL DEFAULT 'text',
  response_content TEXT,
  response_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  use_ai BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent activity logs table
CREATE TABLE IF NOT EXISTS agent_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Aalyx orders table (for order confirmation and payment tracking)
CREATE TABLE IF NOT EXISTS aalyx_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  aalyx_order_id VARCHAR(255),
  order_reference VARCHAR(255),
  total_amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'MYR',
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  payment_due_date TIMESTAMP,
  last_reminder_sent TIMESTAMP,
  reminder_count INT DEFAULT 0,
  order_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI conversation context table (for OpenAI context management)
CREATE TABLE IF NOT EXISTS ai_conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  system_prompt TEXT,
  business_context TEXT,
  conversation_summary TEXT,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Add incognito_mode to whatsapp_accounts
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS incognito_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS show_channel_name BOOLEAN DEFAULT TRUE;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS channel_display_name VARCHAR(255);

-- Add first_response_at to conversations for analytics
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add agent tracking columns to messages table (for existing tables)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_auto_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS response_time_ms INT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add unique constraint on ai_conversation_context
ALTER TABLE ai_conversation_context DROP CONSTRAINT IF EXISTS ai_conversation_context_conversation_id_key;
ALTER TABLE ai_conversation_context ADD CONSTRAINT ai_conversation_context_conversation_id_key UNIQUE (conversation_id);

-- Add jid_type to contacts for LID vs PN (phone number) format tracking
-- 'pn' = phone number (@s.whatsapp.net), 'lid' = link id (@lid)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS jid_type VARCHAR(10) DEFAULT 'pn';

-- Add media support to templates table (for existing databases)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'text';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- Core lookup indexes
CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(whatsapp_account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_user ON whatsapp_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending ON scheduled_messages(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_active ON auto_reply_rules(whatsapp_account_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_agent_activity_logs_agent ON agent_activity_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aalyx_orders_conversation ON aalyx_orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id, created_at DESC);

-- Contacts table indexes (frequently searched/filtered)
CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(whatsapp_account_id);

-- Messages table indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(conversation_id, sender_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status != 'read';
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Conversations table indexes
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(whatsapp_account_id, unread_count DESC) WHERE unread_count > 0;

-- Labels and contact_labels indexes
CREATE INDEX IF NOT EXISTS idx_labels_user ON labels(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_labels_label ON contact_labels(label_id);

-- Internal notes index
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON internal_notes(conversation_id, created_at DESC);

-- Scheduled messages indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_conversation ON scheduled_messages(conversation_id);

-- Composite indexes for common JOIN patterns
CREATE INDEX IF NOT EXISTS idx_conv_list_query ON conversations(whatsapp_account_id, last_message_at DESC NULLS LAST)
  INCLUDE (contact_id, unread_count);

-- ============================================================
-- AI SETTINGS AND KNOWLEDGE BANK TABLES
-- ============================================================

-- AI settings per WhatsApp account
CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT FALSE,
  auto_reply BOOLEAN DEFAULT FALSE,
  model VARCHAR(50) DEFAULT 'gpt-4o-mini',
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INT DEFAULT 100,
  max_consecutive_replies INT DEFAULT 2,
  custom_prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  content_length INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge chunks for RAG
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  document_name VARCHAR(255),
  content TEXT NOT NULL,
  chunk_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI interaction logs for monitoring
CREATE TABLE IF NOT EXISTS ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  customer_message TEXT,
  ai_response TEXT,
  model VARCHAR(50),
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for knowledge bank
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_account ON knowledge_documents(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_account ON knowledge_chunks(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_account ON ai_logs(whatsapp_account_id, created_at DESC);

-- ============================================================
-- ORDEROPS INTEGRATION TABLES
-- ============================================================

-- Contact orders table (links OrderOps orders to contacts)
CREATE TABLE IF NOT EXISTS contact_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  orderops_order_id INT NOT NULL,
  order_code VARCHAR(50),
  order_type VARCHAR(50),
  customer_name VARCHAR(255),
  total DECIMAL(10, 2),
  status VARCHAR(50),
  parsed_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes and constraints for contact_orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_orders_orderops_id ON contact_orders(orderops_order_id);
CREATE INDEX IF NOT EXISTS idx_contact_orders_contact ON contact_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_orders_code ON contact_orders(order_code);

-- ============================================================
-- POSTGRESQL 18 PERFORMANCE OPTIMIZATIONS
-- ============================================================

-- 1. CRITICAL: Missing index for label lookups (fixes N+1 query from 1000ms→10ms)
CREATE INDEX IF NOT EXISTS idx_contact_labels_contact ON contact_labels(contact_id);

-- 2. Covering index for last_message query (avoids table lookup for content)
CREATE INDEX IF NOT EXISTS idx_messages_last
  ON messages(conversation_id, created_at DESC)
  INCLUDE (content, content_type, sender_type);

-- 3. BRIN index for time-range queries (analytics - 90% smaller than B-tree)
CREATE INDEX IF NOT EXISTS idx_messages_created_brin
  ON messages USING BRIN (created_at) WITH (pages_per_range = 32);

-- 4. Partial index for recent conversations (hot data)
CREATE INDEX IF NOT EXISTS idx_conversations_recent
  ON conversations(last_message_at DESC)
  WHERE last_message_at > NOW() - INTERVAL '7 days';

-- 5. Expression indexes for case-insensitive search
CREATE INDEX IF NOT EXISTS idx_contacts_name_lower ON contacts(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_contacts_phone_pattern ON contacts(phone_number text_pattern_ops);

-- 6. GIN indexes for JSONB full-text search
CREATE INDEX IF NOT EXISTS idx_contact_orders_parsed_data ON contact_orders USING GIN (parsed_data);
CREATE INDEX IF NOT EXISTS idx_ai_context_jsonb ON ai_conversation_context USING GIN (to_tsvector('english', COALESCE(conversation_summary, '')));

-- 7. Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_conv_sender ON messages(conversation_id, sender_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_account_name ON contacts(whatsapp_account_id, LOWER(name));

-- 8. Analytics optimization indexes
CREATE INDEX IF NOT EXISTS idx_messages_analytics ON messages(created_at, sender_type, agent_id)
  WHERE sender_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_messages_response_time ON messages(agent_id, response_time_ms)
  WHERE response_time_ms IS NOT NULL;

-- 9. Materialized view for dashboard stats (refreshed periodically)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_dashboard_stats') THEN
    CREATE MATERIALIZED VIEW mv_dashboard_stats AS
    SELECT
      wa.user_id,
      wa.id as account_id,
      COUNT(DISTINCT c.id) as total_conversations,
      COUNT(DISTINCT ct.id) as total_contacts,
      COUNT(m.id) FILTER (WHERE m.sender_type = 'agent') as messages_sent,
      COUNT(m.id) FILTER (WHERE m.sender_type = 'contact') as messages_received,
      COUNT(m.id) FILTER (WHERE m.is_auto_reply = TRUE) as auto_replies,
      COALESCE(AVG(m.response_time_ms) FILTER (WHERE m.response_time_ms IS NOT NULL), 0) as avg_response_time,
      NOW() as refreshed_at
    FROM whatsapp_accounts wa
    LEFT JOIN conversations c ON wa.id = c.whatsapp_account_id
    LEFT JOIN contacts ct ON wa.id = ct.whatsapp_account_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    GROUP BY wa.user_id, wa.id;
  END IF;
END $$;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_stats ON mv_dashboard_stats(user_id, account_id);

-- 10. Function to refresh dashboard stats (call periodically or on demand)
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- 11. Optimize table storage for PostgreSQL 18
ALTER TABLE messages SET (fillfactor = 90);
ALTER TABLE conversations SET (fillfactor = 90);
`;

async function runMigrations() {
  console.log('Running migrations...');

  try {
    await pool.query(migrations);
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
