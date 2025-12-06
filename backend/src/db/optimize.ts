import { pool } from '../config/database';

/**
 * Database Performance Optimization
 *
 * This script adds indexes and optimizations based on common query patterns:
 * - Contact lookups by wa_id, phone_number, name
 * - Message lookups by wa_message_id, conversation_id
 * - Search operations using LIKE/ILIKE
 * - JOIN optimizations for conversations, contacts, accounts
 * - Analytics queries
 */

const optimizations = `
-- ============================================================
-- CORE TABLE INDEXES
-- ============================================================

-- Contacts table indexes (frequently searched/filtered)
CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name_lower ON contacts(LOWER(name)) WHERE name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_jid_type ON contacts(jid_type);

-- Messages table indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(conversation_id, sender_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status != 'read';
CREATE INDEX IF NOT EXISTS idx_messages_auto_reply ON messages(is_auto_reply, created_at DESC) WHERE is_auto_reply = TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Conversations table indexes
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(whatsapp_account_id, unread_count DESC) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

-- Labels and contact_labels indexes
CREATE INDEX IF NOT EXISTS idx_labels_user ON labels(user_id);
CREATE INDEX IF NOT EXISTS idx_labels_name_lower ON labels(user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_contact_labels_label ON contact_labels(label_id);

-- Internal notes index
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON internal_notes(conversation_id, created_at DESC);

-- Scheduled messages indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_conversation ON scheduled_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_agent ON scheduled_messages(agent_id);

-- Activity logs indexes (for analytics)
CREATE INDEX IF NOT EXISTS idx_activity_type ON agent_activity_logs(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON agent_activity_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- Auto-reply rules indexes
CREATE INDEX IF NOT EXISTS idx_auto_reply_user ON auto_reply_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_priority ON auto_reply_rules(priority DESC) WHERE is_active = TRUE;

-- Aalyx orders indexes
CREATE INDEX IF NOT EXISTS idx_aalyx_contact ON aalyx_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_aalyx_status ON aalyx_orders(status, payment_status);

-- AI context index
CREATE INDEX IF NOT EXISTS idx_ai_context_updated ON ai_conversation_context(last_updated DESC);

-- ============================================================
-- TEXT SEARCH OPTIMIZATION (for search functionality)
-- ============================================================

-- Enable pg_trgm extension for fuzzy search (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for LIKE/ILIKE searches
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin(name gin_trgm_ops) WHERE name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin(phone_number gin_trgm_ops) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops) WHERE content IS NOT NULL;

-- ============================================================
-- COMPOSITE INDEXES FOR COMMON JOIN PATTERNS
-- ============================================================

-- Conversation list query optimization (dashboard page)
CREATE INDEX IF NOT EXISTS idx_conv_list_query ON conversations(whatsapp_account_id, last_message_at DESC NULLS LAST)
  INCLUDE (contact_id, unread_count);

-- Message thread query optimization
CREATE INDEX IF NOT EXISTS idx_msg_thread_query ON messages(conversation_id, created_at DESC)
  INCLUDE (wa_message_id, sender_type, content_type, content, status);

-- Analytics date range queries
CREATE INDEX IF NOT EXISTS idx_messages_analytics ON messages(created_at, sender_type, is_auto_reply);

-- ============================================================
-- TABLE STATISTICS AND MAINTENANCE
-- ============================================================

-- Update table statistics for query planner
ANALYZE contacts;
ANALYZE messages;
ANALYZE conversations;
ANALYZE whatsapp_accounts;
ANALYZE labels;
ANALYZE contact_labels;
ANALYZE scheduled_messages;
ANALYZE auto_reply_rules;
ANALYZE agent_activity_logs;
ANALYZE internal_notes;

-- ============================================================
-- VACUUM SETTINGS (for Render's managed PostgreSQL)
-- Note: Some settings may require superuser privileges
-- ============================================================

-- These will silently fail on managed databases without proper privileges
-- but are included for completeness

-- Set autovacuum to be more aggressive on high-write tables
DO $$
BEGIN
  -- Messages table (high write volume)
  EXECUTE 'ALTER TABLE messages SET (autovacuum_vacuum_scale_factor = 0.05)';
  EXECUTE 'ALTER TABLE messages SET (autovacuum_analyze_scale_factor = 0.02)';

  -- Agent activity logs (append-only, high volume)
  EXECUTE 'ALTER TABLE agent_activity_logs SET (autovacuum_vacuum_scale_factor = 0.1)';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Autovacuum settings skipped (requires elevated privileges)';
END $$;
`;

async function runOptimizations() {
  console.log('Running database optimizations...');
  console.log('This may take a few minutes for large databases.\n');

  const startTime = Date.now();

  try {
    // Run optimizations
    await pool.query(optimizations);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Optimizations completed successfully in ${elapsed}s!`);

    // Print summary of indexes
    const indexCount = await pool.query(`
      SELECT COUNT(*) as count FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    console.log(`Total indexes in database: ${indexCount.rows[0].count}`);

    // Print table sizes
    console.log('\nTable sizes:');
    const tableSizes = await pool.query(`
      SELECT
        relname as table,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_size_pretty(pg_relation_size(relid)) as data_size,
        pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as index_size
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 10
    `);

    for (const row of tableSizes.rows) {
      console.log(`  ${row.table}: ${row.total_size} (data: ${row.data_size}, indexes: ${row.index_size})`);
    }

  } catch (error: any) {
    // Handle extension creation errors gracefully
    if (error.message?.includes('pg_trgm')) {
      console.log('Note: pg_trgm extension not available (some search optimizations skipped)');
    } else {
      console.error('Optimization error:', error.message);
    }
  } finally {
    await pool.end();
  }
}

// Export for use in migrations
export { optimizations };

// Run if called directly
if (require.main === module) {
  runOptimizations();
}
