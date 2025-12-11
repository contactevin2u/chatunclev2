/**
 * Batch Database Operations
 *
 * Provides batch insert/update operations for high-performance scenarios.
 * Reduces database round-trips by combining multiple operations into single queries.
 *
 * Use cases:
 * - History sync (many messages at once)
 * - Bulk contact imports
 * - Group participant updates
 */

import { pool, execute, queryOne } from './database';

/**
 * Batch insert contacts with ON CONFLICT handling
 * Returns number of contacts processed
 */
export async function batchInsertContacts(
  contacts: Array<{
    account_id: string;
    wa_id: string;
    phone_number: string | null;
    name: string | null;
    jid_type: 'lid' | 'pn';
  }>
): Promise<number> {
  if (contacts.length === 0) return 0;

  // Build VALUES clause
  const values: any[] = [];
  const placeholders: string[] = [];

  contacts.forEach((contact, i) => {
    const offset = i * 5;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
    values.push(
      contact.account_id,
      contact.wa_id,
      contact.phone_number,
      contact.name,
      contact.jid_type
    );
  });

  const query = `
    INSERT INTO contacts (account_id, wa_id, phone_number, name, jid_type)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (account_id, wa_id) WHERE account_id IS NOT NULL DO UPDATE SET
      name = COALESCE(EXCLUDED.name, contacts.name),
      phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
      jid_type = EXCLUDED.jid_type,
      updated_at = NOW()
  `;

  const result = await pool.query(query, values);
  console.log(`[BatchOps] Inserted/updated ${result.rowCount} contacts`);
  return result.rowCount || 0;
}

/**
 * Batch insert messages with deduplication
 * Returns number of messages inserted
 */
export async function batchInsertMessages(
  messages: Array<{
    conversation_id: string;
    wa_message_id: string;
    sender_type: 'contact' | 'agent' | 'system';
    content_type: string;
    content: string | null;
    media_url: string | null;
    media_mime_type: string | null;
    status: string;
    sender_jid?: string | null;
    sender_name?: string | null;
  }>
): Promise<number> {
  if (messages.length === 0) return 0;

  // Process in chunks of 100 to avoid query size limits
  const CHUNK_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    chunk.forEach((msg, j) => {
      const offset = j * 10;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
      );
      values.push(
        msg.conversation_id,
        msg.wa_message_id,
        msg.sender_type,
        msg.content_type,
        msg.content,
        msg.media_url,
        msg.media_mime_type,
        msg.status,
        msg.sender_jid || null,
        msg.sender_name || null
      );
    });

    const query = `
      INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, sender_jid, sender_name)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (conversation_id, wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
    `;

    try {
      const result = await pool.query(query, values);
      totalInserted += result.rowCount || 0;
    } catch (error) {
      // Log but continue - some messages may have conflicts
      console.error(`[BatchOps] Error in batch insert:`, error);
    }
  }

  console.log(`[BatchOps] Inserted ${totalInserted} messages`);
  return totalInserted;
}

/**
 * Batch update message statuses
 */
export async function batchUpdateMessageStatus(
  updates: Array<{
    wa_message_id: string;
    status: string;
  }>
): Promise<number> {
  if (updates.length === 0) return 0;

  // Use CASE WHEN for batch status updates
  const waMessageIds = updates.map(u => u.wa_message_id);
  const cases = updates.map((u, i) => `WHEN wa_message_id = $${i + 1} THEN '${u.status}'`).join(' ');

  const query = `
    UPDATE messages
    SET status = CASE ${cases} END,
        updated_at = NOW()
    WHERE wa_message_id = ANY($${updates.length + 1})
  `;

  const result = await pool.query(query, [...waMessageIds, waMessageIds]);
  console.log(`[BatchOps] Updated ${result.rowCount} message statuses`);
  return result.rowCount || 0;
}

/**
 * Batch insert group participants
 */
export async function batchInsertGroupParticipants(
  groupId: string,
  participants: Array<{
    participant_jid: string;
    is_admin: boolean;
    is_superadmin: boolean;
  }>
): Promise<number> {
  if (participants.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];

  participants.forEach((p, i) => {
    const offset = i * 4;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    values.push(groupId, p.participant_jid, p.is_admin, p.is_superadmin);
  });

  const query = `
    INSERT INTO group_participants (group_id, participant_jid, is_admin, is_superadmin)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (group_id, participant_jid) DO UPDATE SET
      is_admin = EXCLUDED.is_admin,
      is_superadmin = EXCLUDED.is_superadmin,
      updated_at = NOW()
  `;

  const result = await pool.query(query, values);
  console.log(`[BatchOps] Inserted/updated ${result.rowCount} participants`);
  return result.rowCount || 0;
}

/**
 * Batch delete group participants
 */
export async function batchDeleteGroupParticipants(
  groupId: string,
  participantJids: string[]
): Promise<number> {
  if (participantJids.length === 0) return 0;

  const result = await pool.query(
    `DELETE FROM group_participants WHERE group_id = $1 AND participant_jid = ANY($2)`,
    [groupId, participantJids]
  );

  console.log(`[BatchOps] Deleted ${result.rowCount} participants`);
  return result.rowCount || 0;
}

/**
 * Optimized contact lookup with caching hint
 * Uses prepared statement for repeated queries
 */
const contactCache = new Map<string, { id: string; expiresAt: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function getContactIdCached(
  accountId: string,
  waId: string
): Promise<string | null> {
  const cacheKey = `${accountId}:${waId}`;
  const cached = contactCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.id;
  }

  const contact = await queryOne<{ id: string }>(
    'SELECT id FROM contacts WHERE account_id = $1 AND wa_id = $2',
    [accountId, waId]
  );

  if (contact) {
    contactCache.set(cacheKey, {
      id: contact.id,
      expiresAt: Date.now() + CACHE_TTL,
    });
    return contact.id;
  }

  return null;
}

/**
 * Clear contact cache for an account
 */
export function clearContactCache(accountId: string): void {
  const prefix = `${accountId}:`;
  for (const key of contactCache.keys()) {
    if (key.startsWith(prefix)) {
      contactCache.delete(key);
    }
  }
}

/**
 * Periodic cache cleanup
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of contactCache) {
    if (value.expiresAt < now) {
      contactCache.delete(key);
    }
  }
}, 60000); // Every minute
