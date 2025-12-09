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

-- Add reactions support to messages table
-- Format: [{"emoji": "💖", "sender": "60123456789", "timestamp": 1234567890}]
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- ACCOUNT ACCESS CONTROL (Multi-agent account sharing)
-- ============================================================
-- Allows account owners to grant other agents access to their WhatsApp accounts
-- Permission levels: 'full' (send/receive/manage), 'send' (send messages only), 'view' (read-only)
CREATE TABLE IF NOT EXISTS account_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(20) DEFAULT 'full',
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(whatsapp_account_id, agent_id)
);

-- Index for fast access lookup
CREATE INDEX IF NOT EXISTS idx_account_access_agent ON account_access(agent_id);
CREATE INDEX IF NOT EXISTS idx_account_access_account ON account_access(whatsapp_account_id);
-- CRITICAL: Composite index for the common JOIN pattern (wa.id, agent_id) used in every route
CREATE INDEX IF NOT EXISTS idx_account_access_account_agent ON account_access(whatsapp_account_id, agent_id);

-- ============================================================
-- MESSAGE DEDUPLICATION
-- ============================================================
-- Prevent duplicate messages when history syncs multiple times
-- Uses partial unique index since wa_message_id can be NULL for unsent messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id_unique
  ON messages(conversation_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

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
  mother_order_id INT,
  order_code VARCHAR(50),
  order_type VARCHAR(50),
  customer_name VARCHAR(255),
  total DECIMAL(10, 2),
  balance DECIMAL(10, 2),
  status VARCHAR(50),
  delivery_status VARCHAR(50),
  parsed_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add columns if table exists (for migrations) - MUST run before indexes
ALTER TABLE contact_orders ADD COLUMN IF NOT EXISTS mother_order_id INT;
ALTER TABLE contact_orders ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2);
ALTER TABLE contact_orders ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50);

-- Indexes and constraints for contact_orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_orders_orderops_id ON contact_orders(orderops_order_id);
CREATE INDEX IF NOT EXISTS idx_contact_orders_contact ON contact_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_orders_code ON contact_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_contact_orders_mother ON contact_orders(mother_order_id);
CREATE INDEX IF NOT EXISTS idx_contact_orders_conversation ON contact_orders(conversation_id);

-- ============================================================
-- WHATSAPP GROUPS SUPPORT
-- ============================================================

-- Groups table - stores WhatsApp group metadata
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  group_jid VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  description TEXT,
  owner_jid VARCHAR(100),
  participant_count INT DEFAULT 0,
  profile_pic_url TEXT,
  creation_timestamp TIMESTAMP,
  is_announce BOOLEAN DEFAULT FALSE,
  is_restrict BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(whatsapp_account_id, group_jid)
);

-- Group participants table
CREATE TABLE IF NOT EXISTS group_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  participant_jid VARCHAR(100) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  is_superadmin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, participant_jid)
);

-- Add updated_at to group_participants for existing tables
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add group support to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- Modify contact_id to be nullable for group conversations
ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL;

-- Add sender_jid to messages for group messages (to identify who sent it)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_jid VARCHAR(100);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);

-- Indexes for groups
CREATE INDEX IF NOT EXISTS idx_groups_account ON groups(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_groups_jid ON groups(group_jid);
CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_jid ON group_participants(participant_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_group ON conversations(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_is_group ON conversations(whatsapp_account_id, is_group);

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

-- 4. Index for conversation sorting (replacing partial index - NOW() not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON conversations(last_message_at DESC NULLS LAST);

-- 5. Expression indexes for case-insensitive search
CREATE INDEX IF NOT EXISTS idx_contacts_name_lower ON contacts(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_contacts_phone_pattern ON contacts(phone_number text_pattern_ops);

-- 6. GIN indexes for JSONB full-text search
CREATE INDEX IF NOT EXISTS idx_contact_orders_parsed_data ON contact_orders USING GIN (parsed_data);
CREATE INDEX IF NOT EXISTS idx_ai_context_jsonb ON ai_conversation_context USING GIN (to_tsvector('english', COALESCE(conversation_summary, '')));

-- 7. Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_conv_sender ON messages(conversation_id, sender_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_account_name ON contacts(whatsapp_account_id, LOWER(name));

-- CRITICAL: Index for wa_message_id duplicate checks (used in every message sync)
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- CRITICAL: Index for contact lookups by wa_id (used in message handling)
CREATE INDEX IF NOT EXISTS idx_contacts_account_waid ON contacts(whatsapp_account_id, wa_id);

-- CRITICAL: Index for conversation lookups by contact (used in message routing)
CREATE INDEX IF NOT EXISTS idx_conversations_account_contact ON conversations(whatsapp_account_id, contact_id);

-- CRITICAL: Index for group conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_account_group ON conversations(whatsapp_account_id, group_id) WHERE group_id IS NOT NULL;

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

-- ============================================================
-- GAMIFICATION SYSTEM (Sales Team Motivation)
-- ============================================================

-- Agent daily stats (for leaderboard calculations)
CREATE TABLE IF NOT EXISTS agent_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  messages_sent INT DEFAULT 0,
  conversations_handled INT DEFAULT 0,
  avg_response_time_ms INT,
  first_response_count INT DEFAULT 0,
  auto_replies_triggered INT DEFAULT 0,
  templates_used INT DEFAULT 0,
  points_earned INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, stat_date)
);

-- Agent streaks (consecutive activity days)
CREATE TABLE IF NOT EXISTS agent_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_activity_date DATE,
  streak_start_date DATE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'trophy',
  color VARCHAR(20) DEFAULT 'gold',
  points INT DEFAULT 100,
  criteria_type VARCHAR(50) NOT NULL,
  criteria_value INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent earned achievements
CREATE TABLE IF NOT EXISTS agent_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, achievement_id)
);

-- Points transactions (audit trail)
CREATE TABLE IF NOT EXISTS points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  points INT NOT NULL,
  reason VARCHAR(100) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team challenges (optional competitions)
CREATE TABLE IF NOT EXISTS team_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metric VARCHAR(50) NOT NULL,
  target_value INT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  reward_points INT DEFAULT 500,
  status VARCHAR(20) DEFAULT 'active',
  winner_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Challenge participants
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES team_challenges(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  current_value INT DEFAULT 0,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(challenge_id, agent_id)
);

-- Indexes for gamification
CREATE INDEX IF NOT EXISTS idx_agent_daily_stats_agent ON agent_daily_stats(agent_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_daily_stats_date ON agent_daily_stats(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_achievements_agent ON agent_achievements(agent_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_agent ON points_transactions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_challenges_active ON team_challenges(status, end_date) WHERE status = 'active';

-- ============================================================
-- LID/PN MAPPING TABLE (WhatsApp ID Deduplication)
-- ============================================================
-- WhatsApp uses two JID formats: LID (Linked ID) and PN (Phone Number)
-- The same user can appear as both formats causing duplicate contacts
-- This table stores bidirectional mappings between LID and PN

CREATE TABLE IF NOT EXISTS lid_pn_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  lid VARCHAR(100) NOT NULL,
  pn VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(whatsapp_account_id, lid),
  UNIQUE(whatsapp_account_id, pn)
);

-- Indexes for fast mapping lookups
CREATE INDEX IF NOT EXISTS idx_lid_pn_mappings_account ON lid_pn_mappings(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_lid_pn_mappings_lid ON lid_pn_mappings(lid);
CREATE INDEX IF NOT EXISTS idx_lid_pn_mappings_pn ON lid_pn_mappings(pn);

-- ============================================================
-- PROFILE PICTURE CACHING
-- ============================================================
-- Track when profile pictures were last fetched to enable caching
-- Profile pics are downloaded from WhatsApp, uploaded to Cloudinary, and cached

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_pic_fetched_at TIMESTAMP;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS profile_pic_fetched_at TIMESTAMP;

-- Index for finding stale profile pics
CREATE INDEX IF NOT EXISTS idx_contacts_profile_pic_stale
  ON contacts(whatsapp_account_id, profile_pic_fetched_at)
  WHERE profile_pic_url IS NULL OR profile_pic_fetched_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_profile_pic_stale
  ON groups(whatsapp_account_id, profile_pic_fetched_at)
  WHERE profile_pic_url IS NULL OR profile_pic_fetched_at IS NULL;

-- ============================================================
-- CLEANUP DUPLICATE LID/PN CONTACTS
-- ============================================================
-- One-time cleanup: Find and merge duplicate contacts where both LID and PN
-- versions exist for the same user. Uses the lid_pn_mappings table to identify.
-- Safe to run multiple times (idempotent).

-- Create a function to merge duplicates (only if it doesn't exist)
CREATE OR REPLACE FUNCTION merge_lid_pn_duplicates() RETURNS void AS $$
DECLARE
  mapping RECORD;
  lid_contact_id UUID;
  pn_contact_id UUID;
BEGIN
  -- Loop through all mappings to find duplicates
  FOR mapping IN
    SELECT m.whatsapp_account_id, m.lid, m.pn
    FROM lid_pn_mappings m
  LOOP
    -- Check if both LID and PN contacts exist
    SELECT id INTO lid_contact_id
    FROM contacts
    WHERE whatsapp_account_id = mapping.whatsapp_account_id AND wa_id = mapping.lid;

    SELECT id INTO pn_contact_id
    FROM contacts
    WHERE whatsapp_account_id = mapping.whatsapp_account_id AND wa_id = mapping.pn;

    -- If both exist and are different, merge them
    IF lid_contact_id IS NOT NULL AND pn_contact_id IS NOT NULL AND lid_contact_id != pn_contact_id THEN
      RAISE NOTICE 'Merging duplicate contacts: LID % -> PN % (keeping %)', mapping.lid, mapping.pn, pn_contact_id;

      -- Move LID contact's conversations to PN contact
      UPDATE conversations
      SET contact_id = pn_contact_id, updated_at = NOW()
      WHERE contact_id = lid_contact_id;

      -- Move LID contact's labels to PN contact (ignore conflicts)
      INSERT INTO contact_labels (contact_id, label_id)
      SELECT pn_contact_id, label_id FROM contact_labels WHERE contact_id = lid_contact_id
      ON CONFLICT DO NOTHING;

      -- Delete LID contact's labels
      DELETE FROM contact_labels WHERE contact_id = lid_contact_id;

      -- Move contact_orders if table exists (safely)
      BEGIN
        UPDATE contact_orders
        SET contact_id = pn_contact_id, updated_at = NOW()
        WHERE contact_id = lid_contact_id;
      EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip
        NULL;
      END;

      -- Delete the LID contact
      DELETE FROM contacts WHERE id = lid_contact_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the cleanup function
SELECT merge_lid_pn_duplicates();

-- Drop the function after use (optional, keeps it for future cleanups)
-- DROP FUNCTION IF EXISTS merge_lid_pn_duplicates();

-- Also merge conversations if both LID and PN conversations exist for same contact
-- This handles cases where contact was merged but conversations weren't
CREATE OR REPLACE FUNCTION merge_duplicate_conversations() RETURNS void AS $$
DECLARE
  dup RECORD;
BEGIN
  -- Find contacts with multiple conversations (shouldn't happen with UNIQUE constraint, but check anyway)
  FOR dup IN
    SELECT c.whatsapp_account_id, c.contact_id, array_agg(c.id ORDER BY c.last_message_at DESC NULLS LAST) as conv_ids
    FROM conversations c
    GROUP BY c.whatsapp_account_id, c.contact_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Merging duplicate conversations for contact %: %', dup.contact_id, dup.conv_ids;

    -- Keep the first (most recent) conversation, merge messages from others
    FOR i IN 2..array_length(dup.conv_ids, 1) LOOP
      -- Move messages from duplicate to primary
      UPDATE messages
      SET conversation_id = dup.conv_ids[1], updated_at = NOW()
      WHERE conversation_id = dup.conv_ids[i];

      -- Delete the duplicate conversation
      DELETE FROM conversations WHERE id = dup.conv_ids[i];
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run conversation merge
SELECT merge_duplicate_conversations();

-- Insert default achievements
INSERT INTO achievements (code, name, description, icon, color, points, criteria_type, criteria_value) VALUES
  ('first_message', 'First Contact', 'Send your first message', 'message-circle', 'blue', 50, 'messages_sent', 1),
  ('hundred_messages', 'Centurion', 'Send 100 messages', 'zap', 'yellow', 200, 'messages_sent', 100),
  ('thousand_messages', 'Message Master', 'Send 1,000 messages', 'crown', 'gold', 1000, 'messages_sent', 1000),
  ('speed_demon', 'Speed Demon', 'Average response under 1 minute', 'clock', 'green', 300, 'avg_response_ms', 60000),
  ('week_streak', 'Week Warrior', 'Maintain a 7-day streak', 'flame', 'orange', 250, 'streak_days', 7),
  ('month_streak', 'Monthly Champion', 'Maintain a 30-day streak', 'award', 'purple', 1000, 'streak_days', 30),
  ('ten_conversations', 'Conversation Starter', 'Handle 10 conversations', 'users', 'teal', 100, 'conversations_handled', 10),
  ('fifty_conversations', 'Chat Champion', 'Handle 50 conversations', 'star', 'gold', 500, 'conversations_handled', 50)
ON CONFLICT (code) DO NOTHING;
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
