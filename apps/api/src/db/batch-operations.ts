import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import type { ContactInsert, MessageInsert } from '@chatuncle/shared';

/**
 * Batch insert contacts using PostgreSQL UNNEST
 * Up to 200 contacts at a time
 */
export async function batchInsertContacts(
  contacts: ContactInsert[]
): Promise<string[]> {
  if (contacts.length === 0) return [];

  const client = await pool.connect();
  try {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO contacts (account_id, channel_type, channel_contact_id, name, phone_number, jid_type)
      SELECT * FROM UNNEST(
        $1::uuid[],
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[]
      )
      ON CONFLICT (account_id, channel_contact_id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
        updated_at = NOW()
      RETURNING id
      `,
      [
        contacts.map(c => c.accountId),
        contacts.map(c => c.channelType),
        contacts.map(c => c.channelContactId),
        contacts.map(c => c.name ?? null),
        contacts.map(c => c.phoneNumber ?? null),
        contacts.map(c => c.jidType ?? null),
      ]
    );

    return result.rows.map(r => r.id);
  } finally {
    client.release();
  }
}

/**
 * Batch insert messages using PostgreSQL UNNEST
 * Up to 100 messages at a time
 */
export async function batchInsertMessages(
  messages: MessageInsert[]
): Promise<string[]> {
  if (messages.length === 0) return [];

  const client = await pool.connect();
  try {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO messages (
        conversation_id, channel_message_id, channel_type, sender_type, content_type,
        content, media_url, media_mime_type, status, sender_jid, sender_name,
        quoted_channel_message_id, quoted_content, quoted_sender_name, created_at
      )
      SELECT * FROM UNNEST(
        $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[],
        $12::text[], $13::text[], $14::text[], $15::timestamptz[]
      )
      ON CONFLICT (channel_message_id) DO NOTHING
      RETURNING id
      `,
      [
        messages.map(m => m.conversationId),
        messages.map(m => m.channelMessageId),
        messages.map(m => m.channelType),
        messages.map(m => m.senderType),
        messages.map(m => m.contentType),
        messages.map(m => m.content ?? null),
        messages.map(m => m.mediaUrl ?? null),
        messages.map(m => m.mediaMimeType ?? null),
        messages.map(m => m.status),
        messages.map(m => m.senderJid ?? null),
        messages.map(m => m.senderName ?? null),
        messages.map(m => m.quotedChannelMessageId ?? null),
        messages.map(m => m.quotedContent ?? null),
        messages.map(m => m.quotedSenderName ?? null),
        messages.map(m => m.createdAt),
      ]
    );

    return result.rows.map(r => r.id);
  } finally {
    client.release();
  }
}

/**
 * Batch check if messages exist by channel_message_id
 * Returns set of existing message IDs
 */
export async function batchCheckMessagesExist(
  channelMessageIds: string[]
): Promise<Set<string>> {
  if (channelMessageIds.length === 0) return new Set();

  const client = await pool.connect();
  try {
    const result = await client.query<{ channel_message_id: string }>(
      `SELECT channel_message_id FROM messages WHERE channel_message_id = ANY($1)`,
      [channelMessageIds]
    );

    return new Set(result.rows.map(r => r.channel_message_id));
  } finally {
    client.release();
  }
}

/**
 * Batch update message statuses
 */
export async function batchUpdateMessageStatus(
  updates: Array<{ channelMessageId: string; status: string }>
): Promise<void> {
  if (updates.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE messages SET
        status = updates.status
      FROM (
        SELECT UNNEST($1::text[]) as channel_message_id, UNNEST($2::text[]) as status
      ) as updates
      WHERE messages.channel_message_id = updates.channel_message_id
      `,
      [
        updates.map(u => u.channelMessageId),
        updates.map(u => u.status),
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Batch upsert groups
 */
export async function batchUpsertGroups(
  accountId: string,
  groups: Array<{
    id: string;
    subject: string;
    desc?: string;
    owner?: string;
    participants: unknown[];
  }>
): Promise<void> {
  if (groups.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO groups (account_id, group_jid, name, description, owner_jid, participant_count)
      SELECT $1::uuid, * FROM UNNEST(
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::int[]
      )
      ON CONFLICT (account_id, group_jid) DO UPDATE SET
        name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, groups.description),
        owner_jid = COALESCE(EXCLUDED.owner_jid, groups.owner_jid),
        participant_count = EXCLUDED.participant_count,
        updated_at = NOW()
      `,
      [
        accountId,
        groups.map(g => g.id),
        groups.map(g => g.subject),
        groups.map(g => g.desc ?? null),
        groups.map(g => g.owner ?? null),
        groups.map(g => g.participants?.length ?? 0),
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Batch update contact profiles
 */
export async function batchUpdateContactProfiles(
  accountId: string,
  profiles: Array<{
    jid: string;
    status?: string | null;
    profilePic?: string | null;
  }>
): Promise<void> {
  if (profiles.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE contacts SET
        profile_pic_url = COALESCE(updates.profile_pic, contacts.profile_pic_url),
        updated_at = NOW()
      FROM (
        SELECT UNNEST($2::text[]) as wa_id, UNNEST($3::text[]) as profile_pic
      ) as updates
      WHERE contacts.account_id = $1 AND contacts.wa_id = updates.wa_id
      `,
      [
        accountId,
        profiles.map(p => p.jid),
        profiles.map(p => p.profilePic ?? null),
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Batch upsert LID/PN mappings
 */
export async function batchUpsertLidPnMappings(
  accountId: string,
  mappings: Array<{ lid: string; pn: string }>
): Promise<void> {
  if (mappings.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO lid_pn_mappings (account_id, lid, pn)
      SELECT $1::uuid, * FROM UNNEST($2::text[], $3::text[])
      ON CONFLICT (account_id, lid) DO UPDATE SET
        pn = EXCLUDED.pn
      `,
      [
        accountId,
        mappings.map(m => m.lid),
        mappings.map(m => m.pn),
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Get LID/PN mapping for an account
 */
export async function getLidPnMapping(
  accountId: string,
  lid: string
): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ pn: string }>(
      `SELECT pn FROM lid_pn_mappings WHERE account_id = $1 AND lid = $2`,
      [accountId, lid]
    );
    return result.rows[0]?.pn ?? null;
  } finally {
    client.release();
  }
}
