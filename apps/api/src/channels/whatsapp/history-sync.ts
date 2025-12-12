/**
 * WhatsApp History Sync Service
 *
 * Non-blocking background history sync processing.
 * NEVER blocks live message processing.
 *
 * Features:
 * - Batch processing with UNNEST for performance
 * - Parallel message/contact/group processing
 * - Progress tracking via Socket.io
 * - Deduplication to avoid re-processing
 */

import type { proto, Contact } from '@whiskeysockets/baileys';
import { BATCH_CONFIG } from '../../config/constants.js';
import {
  batchInsertContacts,
  batchInsertMessages,
  batchUpsertGroups,
  batchCheckMessagesExist,
  batchUpsertLidPnMappings,
} from '../../db/batch-operations.js';
import { getDeduplicator } from '../../services/deduplication.js';
import {
  processInParallelBatches,
  chunk,
  yieldToEventLoop,
  runInBackground,
} from '../../utils/parallel.js';
import type { ContactInsert, MessageInsert, ContentType } from '@chatuncle/shared';

// Progress callback type
export type HistorySyncProgressCallback = (progress: {
  accountId: string;
  phase: 'contacts' | 'groups' | 'messages' | 'complete';
  processed: number;
  total: number;
  percentage: number;
}) => void;

// Sync options
export interface HistorySyncOptions {
  onProgress?: HistorySyncProgressCallback;
  maxMessages?: number;
  skipContacts?: boolean;
  skipGroups?: boolean;
}

// Sync result
export interface HistorySyncResult {
  accountId: string;
  contactsProcessed: number;
  groupsProcessed: number;
  messagesProcessed: number;
  messagesDeduplicated: number;
  durationMs: number;
  errors: string[];
}

/**
 * Process history sync in background - NEVER blocks live messages
 *
 * Call this from the Baileys 'messaging-history.set' event handler.
 * It runs in background via setImmediate, so returns immediately.
 *
 * @param accountId - Account ID
 * @param data - History sync data from Baileys
 * @param options - Sync options
 */
export function processHistorySyncBackground(
  accountId: string,
  data: {
    messages?: proto.IWebMessageInfo[];
    contacts?: Contact[];
    isLatest?: boolean;
  },
  options: HistorySyncOptions = {}
): void {
  runInBackground(
    () => processHistorySync(accountId, data, options),
    (error) => {
      console.error(`[HistorySync] Background sync failed for ${accountId}:`, error);
    }
  );
}

/**
 * Main history sync processing function
 *
 * This is the core sync logic. Can be called directly for BullMQ workers
 * or via processHistorySyncBackground for in-process background sync.
 */
export async function processHistorySync(
  accountId: string,
  data: {
    messages?: proto.IWebMessageInfo[];
    contacts?: Contact[];
    isLatest?: boolean;
  },
  options: HistorySyncOptions = {}
): Promise<HistorySyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const deduplicator = getDeduplicator();

  const messages = data.messages || [];
  const contacts = data.contacts || [];
  const maxMessages = options.maxMessages || messages.length;

  console.log(`[HistorySync] Starting sync for ${accountId}: ${messages.length} messages, ${contacts.length} contacts`);

  let contactsProcessed = 0;
  let groupsProcessed = 0;
  let messagesProcessed = 0;
  let messagesDeduplicated = 0;

  try {
    // ========================================
    // PHASE 1: Process Contacts (needed for messages)
    // ========================================
    if (!options.skipContacts && contacts.length > 0) {
      contactsProcessed = await processContactsBatch(accountId, contacts, {
        onProgress: (processed, total) => {
          options.onProgress?.({
            accountId,
            phase: 'contacts',
            processed,
            total,
            percentage: Math.round((processed / total) * 100),
          });
        },
        onError: (error, contact) => {
          errors.push(`Contact ${(contact as any)?.id}: ${error.message}`);
        },
      });

      // Yield to event loop after contacts
      await yieldToEventLoop();
    }

    // ========================================
    // PHASE 2: Extract and Process Groups
    // ========================================
    if (!options.skipGroups) {
      const groupJids = extractGroupJids(messages);
      if (groupJids.length > 0) {
        groupsProcessed = await processGroupsBatch(accountId, groupJids, {
          onProgress: (processed, total) => {
            options.onProgress?.({
              accountId,
              phase: 'groups',
              processed,
              total,
              percentage: Math.round((processed / total) * 100),
            });
          },
          onError: (error, groupJid) => {
            errors.push(`Group ${groupJid}: ${error.message}`);
          },
        });

        await yieldToEventLoop();
      }
    }

    // ========================================
    // PHASE 3: Filter and Process Messages
    // ========================================
    if (messages.length > 0) {
      // Extract message IDs for deduplication
      const messageIds = messages
        .slice(0, maxMessages)
        .map((m) => m.key?.id)
        .filter((id): id is string => !!id);

      // Bulk filter to get only new messages
      const newMessageIds = new Set(await deduplicator.filterNew(accountId, messageIds));
      messagesDeduplicated = messageIds.length - newMessageIds.size;

      // Filter messages to only new ones
      const newMessages = messages
        .slice(0, maxMessages)
        .filter((m) => m.key?.id && newMessageIds.has(m.key.id));

      console.log(`[HistorySync] ${newMessages.length} new messages after dedup (${messagesDeduplicated} duplicates)`);

      if (newMessages.length > 0) {
        messagesProcessed = await processMessagesBatch(accountId, newMessages, {
          onProgress: (processed, total) => {
            options.onProgress?.({
              accountId,
              phase: 'messages',
              processed,
              total,
              percentage: Math.round((processed / total) * 100),
            });
          },
          onError: (error, msg) => {
            errors.push(`Message ${(msg as any)?.key?.id}: ${error.message}`);
          },
        });
      }
    }

    // ========================================
    // PHASE 4: Complete
    // ========================================
    options.onProgress?.({
      accountId,
      phase: 'complete',
      processed: messagesProcessed,
      total: messages.length,
      percentage: 100,
    });

  } catch (error) {
    errors.push(`Fatal: ${(error as Error).message}`);
    console.error(`[HistorySync] Fatal error for ${accountId}:`, error);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[HistorySync] Completed for ${accountId} in ${durationMs}ms: ${messagesProcessed} messages, ${contactsProcessed} contacts, ${groupsProcessed} groups`);

  return {
    accountId,
    contactsProcessed,
    groupsProcessed,
    messagesProcessed,
    messagesDeduplicated,
    durationMs,
    errors,
  };
}

/**
 * Process contacts in batches
 */
async function processContactsBatch(
  accountId: string,
  contacts: Contact[],
  options: {
    onProgress?: (processed: number, total: number) => void;
    onError?: (error: Error, contact: Contact) => void;
  }
): Promise<number> {
  const chunks = chunk(contacts, BATCH_CONFIG.HISTORY_CONTACT_BATCH_SIZE);
  let processed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];

    // Transform contacts for insertion
    const contactInserts: ContactInsert[] = batch
      .filter((c) => c.id) // Must have ID
      .map((c) => ({
        accountId,
        channelType: 'whatsapp' as const,
        channelContactId: c.id!,
        name: c.name || c.notify || undefined,
        phoneNumber: extractPhoneNumber(c.id!),
        jidType: c.id!.endsWith('@g.us') ? 'group' : 'user',
        waId: c.id!,
      }));

    // Extract LID/PN mappings
    const mappings: Array<{ lid: string; pn: string }> = [];
    for (const c of batch) {
      if ((c as any).lid && c.id) {
        mappings.push({
          lid: (c as any).lid,
          pn: c.id.replace('@s.whatsapp.net', ''),
        });
      }
    }

    try {
      // Batch insert contacts
      if (contactInserts.length > 0) {
        await batchInsertContacts(contactInserts);
      }

      // Batch upsert LID/PN mappings
      if (mappings.length > 0) {
        await batchUpsertLidPnMappings(accountId, mappings);
      }

      processed += batch.length;
      options.onProgress?.(processed, contacts.length);
    } catch (error) {
      console.error(`[HistorySync] Contact batch error:`, error);
      batch.forEach((c) => options.onError?.(error as Error, c));
    }

    // Yield to event loop between batches
    await yieldToEventLoop();
  }

  return processed;
}

/**
 * Process groups in batches
 */
async function processGroupsBatch(
  accountId: string,
  groupJids: string[],
  options: {
    onProgress?: (processed: number, total: number) => void;
    onError?: (error: Error, groupJid: string) => void;
  }
): Promise<number> {
  const chunks = chunk(groupJids, BATCH_CONFIG.HISTORY_GROUP_BATCH_SIZE);
  let processed = 0;

  for (const batch of chunks) {
    // For history sync, we just create placeholder groups
    // Full metadata will be fetched by metadata sync service
    const groupInserts = batch.map((jid) => ({
      id: jid,
      subject: jid.replace('@g.us', ''), // Placeholder name
      desc: undefined,
      owner: undefined,
      participants: [],
    }));

    try {
      await batchUpsertGroups(accountId, groupInserts);
      processed += batch.length;
      options.onProgress?.(processed, groupJids.length);
    } catch (error) {
      console.error(`[HistorySync] Group batch error:`, error);
      batch.forEach((jid) => options.onError?.(error as Error, jid));
    }

    await yieldToEventLoop();
  }

  return processed;
}

/**
 * Process messages in batches
 */
async function processMessagesBatch(
  accountId: string,
  messages: proto.IWebMessageInfo[],
  options: {
    onProgress?: (processed: number, total: number) => void;
    onError?: (error: Error, msg: proto.IWebMessageInfo) => void;
  }
): Promise<number> {
  const chunks = chunk(messages, BATCH_CONFIG.HISTORY_MESSAGE_BATCH_SIZE);
  let processed = 0;

  for (const batch of chunks) {
    // Transform messages for insertion
    const messageInserts: MessageInsert[] = batch
      .filter((m) => m.key?.id && m.key.remoteJid && m.message)
      .map((m) => transformMessageForInsert(accountId, m))
      .filter((m): m is MessageInsert => m !== null);

    try {
      if (messageInserts.length > 0) {
        await batchInsertMessages(messageInserts);
      }

      processed += batch.length;
      options.onProgress?.(processed, messages.length);
    } catch (error) {
      console.error(`[HistorySync] Message batch error:`, error);
      batch.forEach((m) => options.onError?.(error as Error, m));
    }

    await yieldToEventLoop();
  }

  return processed;
}

/**
 * Transform a Baileys message to MessageInsert format
 */
function transformMessageForInsert(
  accountId: string,
  msg: proto.IWebMessageInfo
): MessageInsert | null {
  if (!msg.key || !msg.key.id || !msg.key.remoteJid || !msg.message) {
    return null;
  }

  const messageContent = msg.message;
  let contentType: ContentType = 'text';
  let content: string | undefined;
  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;

  // Determine content type and extract content
  if (messageContent.conversation) {
    contentType = 'text';
    content = messageContent.conversation;
  } else if (messageContent.extendedTextMessage) {
    contentType = 'text';
    content = messageContent.extendedTextMessage.text || undefined;
  } else if (messageContent.imageMessage) {
    contentType = 'image';
    content = messageContent.imageMessage.caption || undefined;
    mediaMimeType = messageContent.imageMessage.mimetype || undefined;
  } else if (messageContent.videoMessage) {
    contentType = 'video';
    content = messageContent.videoMessage.caption || undefined;
    mediaMimeType = messageContent.videoMessage.mimetype || undefined;
  } else if (messageContent.audioMessage) {
    contentType = 'audio';
    mediaMimeType = messageContent.audioMessage.mimetype || undefined;
  } else if (messageContent.documentMessage) {
    contentType = 'document';
    content = messageContent.documentMessage.caption || undefined;
    mediaMimeType = messageContent.documentMessage.mimetype || undefined;
  } else if (messageContent.stickerMessage) {
    contentType = 'sticker';
    mediaMimeType = messageContent.stickerMessage.mimetype || undefined;
  } else if (messageContent.locationMessage) {
    contentType = 'location';
    const loc = messageContent.locationMessage;
    content = `${loc.degreesLatitude},${loc.degreesLongitude}`;
  } else {
    // Skip unsupported message types
    return null;
  }

  const senderId = msg.key.participant || msg.key.remoteJid;
  const contextInfo = (messageContent as any).contextInfo;

  return {
    // Note: conversationId needs to be resolved elsewhere
    // For history sync, we'll need to create/lookup conversations
    conversationId: '', // Placeholder - will be resolved
    channelMessageId: msg.key.id!,
    channelType: 'whatsapp',
    senderType: msg.key.fromMe ? 'agent' : 'contact',
    contentType,
    content,
    mediaUrl,
    mediaMimeType,
    status: 'delivered', // History messages are already delivered
    senderJid: senderId || undefined,
    senderName: msg.pushName || undefined,
    quotedChannelMessageId: contextInfo?.stanzaId,
    quotedContent: contextInfo?.quotedMessage?.conversation,
    quotedSenderName: undefined,
    createdAt: new Date((msg.messageTimestamp as number) * 1000),
  };
}

/**
 * Extract unique group JIDs from messages
 */
function extractGroupJids(messages: proto.IWebMessageInfo[]): string[] {
  const groupJids = new Set<string>();

  for (const msg of messages) {
    if (msg.key?.remoteJid?.endsWith('@g.us')) {
      groupJids.add(msg.key.remoteJid);
    }
  }

  return Array.from(groupJids);
}

/**
 * Extract phone number from JID
 */
function extractPhoneNumber(jid: string): string | undefined {
  const match = jid.match(/^(\d+)@/);
  return match ? match[1] : undefined;
}
