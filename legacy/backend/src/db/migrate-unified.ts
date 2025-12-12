import { pool } from '../config/database';

/**
 * UNIFIED ACCOUNTS MIGRATION
 *
 * This migration consolidates the dual-account architecture:
 * - Renames whatsapp_accounts → accounts
 * - Adds channel_type column to accounts
 * - Migrates channel_accounts data into accounts
 * - Merges channel_account_access into account_access
 * - Updates all foreign key references
 *
 * Run this AFTER the main migrate.ts has run.
 */

const unificationMigration = `
-- ============================================================
-- PHASE 1: ADD CHANNEL_TYPE TO WHATSAPP_ACCOUNTS
-- ============================================================

-- Add channel_type and credentials columns to whatsapp_accounts
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'whatsapp';
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS channel_identifier VARCHAR(255);
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS credentials JSONB;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP;

-- Backfill channel_identifier with phone_number for existing WhatsApp accounts
UPDATE whatsapp_accounts
SET channel_identifier = COALESCE(phone_number, id::text)
WHERE channel_identifier IS NULL;

-- ============================================================
-- PHASE 2: MIGRATE CHANNEL_ACCOUNTS DATA INTO WHATSAPP_ACCOUNTS
-- ============================================================

-- Insert channel_accounts data into whatsapp_accounts (skip if already migrated)
INSERT INTO whatsapp_accounts (
  id, user_id, channel_type, channel_identifier, name, credentials, settings, status,
  last_connected_at, created_at, updated_at
)
SELECT
  ca.id,
  ca.user_id,
  ca.channel_type,
  ca.channel_identifier,
  ca.account_name as name,
  ca.credentials,
  ca.settings,
  ca.status,
  ca.last_connected_at,
  ca.created_at,
  ca.updated_at
FROM channel_accounts ca
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_accounts wa WHERE wa.id = ca.id
);

-- ============================================================
-- PHASE 3: MERGE CHANNEL_ACCOUNT_ACCESS INTO ACCOUNT_ACCESS
-- ============================================================

-- First, rename columns in account_access to be consistent
-- (agent_id stays as agent_id, permission stays as permission)

-- Insert channel_account_access data into account_access
INSERT INTO account_access (
  whatsapp_account_id, agent_id, permission, granted_at
)
SELECT
  caa.channel_account_id,
  caa.user_id,
  caa.permission_level,
  caa.created_at
FROM channel_account_access caa
WHERE NOT EXISTS (
  SELECT 1 FROM account_access aa
  WHERE aa.whatsapp_account_id = caa.channel_account_id
    AND aa.agent_id = caa.user_id
);

-- ============================================================
-- PHASE 4: UPDATE CONTACTS TO USE WHATSAPP_ACCOUNT_ID
-- ============================================================

-- Backfill whatsapp_account_id from channel_account_id where missing
UPDATE contacts
SET whatsapp_account_id = channel_account_id
WHERE whatsapp_account_id IS NULL AND channel_account_id IS NOT NULL;

-- ============================================================
-- PHASE 5: UPDATE CONVERSATIONS TO USE WHATSAPP_ACCOUNT_ID
-- ============================================================

-- Backfill whatsapp_account_id from channel_account_id where missing
UPDATE conversations
SET whatsapp_account_id = channel_account_id
WHERE whatsapp_account_id IS NULL AND channel_account_id IS NOT NULL;

-- ============================================================
-- PHASE 6: RENAME WHATSAPP_ACCOUNTS TO ACCOUNTS
-- ============================================================

-- Rename the table
ALTER TABLE IF EXISTS whatsapp_accounts RENAME TO accounts;

-- Rename the primary column references in dependent tables
ALTER TABLE contacts RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE conversations RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE account_access RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE auto_reply_rules RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE ai_settings RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE ai_logs RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE knowledge_documents RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE knowledge_chunks RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE groups RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE lid_pn_mappings RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE templates RENAME COLUMN whatsapp_account_id TO account_id;
ALTER TABLE template_sequences RENAME COLUMN whatsapp_account_id TO account_id;

-- ============================================================
-- PHASE 7: UPDATE INDEXES FOR NEW TABLE/COLUMN NAMES
-- ============================================================

-- Drop old indexes that reference whatsapp_accounts
DROP INDEX IF EXISTS idx_whatsapp_accounts_user;
DROP INDEX IF EXISTS idx_conversations_account;
DROP INDEX IF EXISTS idx_contacts_account;
DROP INDEX IF EXISTS idx_account_access_account;
DROP INDEX IF EXISTS idx_account_access_account_agent;

-- Create new indexes with accounts table
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_channel_type ON accounts(channel_type);
CREATE INDEX IF NOT EXISTS idx_accounts_user_channel ON accounts(user_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_waid ON contacts(account_id, wa_id);
CREATE INDEX IF NOT EXISTS idx_account_access_account ON account_access(account_id);
CREATE INDEX IF NOT EXISTS idx_account_access_account_agent ON account_access(account_id, agent_id);

-- ============================================================
-- PHASE 8: DROP OLD CHANNEL TABLES (After verification)
-- ============================================================

-- Mark old tables as deprecated (don't drop yet for safety)
-- DROP TABLE IF EXISTS channel_account_access;
-- DROP TABLE IF EXISTS channel_accounts;

-- Drop the channel_account_id columns (now redundant)
ALTER TABLE contacts DROP COLUMN IF EXISTS channel_account_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS channel_account_id;

-- ============================================================
-- PHASE 9: UPDATE MATERIALIZED VIEW
-- ============================================================

-- Drop and recreate materialized view with new table name
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats;

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
  a.user_id,
  a.id as account_id,
  a.channel_type,
  COUNT(DISTINCT c.id) as total_conversations,
  COUNT(DISTINCT ct.id) as total_contacts,
  COUNT(m.id) FILTER (WHERE m.sender_type = 'agent') as messages_sent,
  COUNT(m.id) FILTER (WHERE m.sender_type = 'contact') as messages_received,
  COUNT(m.id) FILTER (WHERE m.is_auto_reply = TRUE) as auto_replies,
  COALESCE(AVG(m.response_time_ms) FILTER (WHERE m.response_time_ms IS NOT NULL), 0) as avg_response_time,
  NOW() as refreshed_at
FROM accounts a
LEFT JOIN conversations c ON a.id = c.account_id
LEFT JOIN contacts ct ON a.id = ct.account_id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY a.user_id, a.id, a.channel_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_stats ON mv_dashboard_stats(user_id, account_id);

-- Update refresh function
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
END;
$$ LANGUAGE plpgsql;
`;

async function runUnificationMigration() {
  console.log('Running unified accounts migration...');
  console.log('This will:');
  console.log('  1. Add channel_type to whatsapp_accounts');
  console.log('  2. Migrate channel_accounts data');
  console.log('  3. Merge channel_account_access into account_access');
  console.log('  4. Rename whatsapp_accounts to accounts');
  console.log('  5. Update all foreign key column names');
  console.log('');

  const client = await pool.connect();

  try {
    // Run in a transaction for safety
    await client.query('BEGIN');

    // Execute the migration
    await client.query(unificationMigration);

    await client.query('COMMIT');
    console.log('Unified accounts migration completed successfully!');

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    console.error('Transaction rolled back. No changes were made.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

runUnificationMigration();
