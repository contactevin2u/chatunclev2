/**
 * WhatsApp Metadata Sync Service
 *
 * Parallel fetching of group metadata and contact profiles.
 * Runs in background without blocking live message processing.
 *
 * Features:
 * - Parallel group metadata fetching with controlled concurrency
 * - Parallel contact profile sync (profile pictures)
 * - Rate-limited to avoid WhatsApp blocks
 * - Progress tracking
 * - Background execution via setImmediate
 */

import type { WASocket, GroupMetadata, Contact } from '@whiskeysockets/baileys';
import { BATCH_CONFIG } from '../../config/constants.js';
import {
  batchUpsertGroups,
  batchUpdateContactProfiles,
  batchInsertContacts,
} from '../../db/batch-operations.js';
import {
  processWithConcurrency,
  chunk,
  yieldToEventLoop,
  runInBackground,
  sleep,
  retryWithBackoff,
} from '../../utils/parallel.js';
import type { ContactInsert } from '@chatuncle/shared';

// Progress callback type
export type MetadataSyncProgressCallback = (progress: {
  accountId: string;
  type: 'groups' | 'contacts' | 'profiles';
  processed: number;
  total: number;
  percentage: number;
}) => void;

// Sync options
export interface MetadataSyncOptions {
  onProgress?: MetadataSyncProgressCallback;
  concurrency?: number;
  rateLimitDelayMs?: number;
}

// Sync result
export interface MetadataSyncResult {
  accountId: string;
  groupsProcessed: number;
  groupsFailed: number;
  contactsProcessed: number;
  profilesUpdated: number;
  durationMs: number;
  errors: string[];
}

/**
 * Sync group metadata in background
 *
 * Fetches full metadata (subject, participants, description, etc.)
 * for all provided group JIDs in parallel with rate limiting.
 *
 * @param sock - WhatsApp socket
 * @param accountId - Account ID
 * @param groupJids - Array of group JIDs to sync
 * @param options - Sync options
 */
export function syncGroupMetadataBackground(
  sock: WASocket,
  accountId: string,
  groupJids: string[],
  options: MetadataSyncOptions = {}
): void {
  runInBackground(
    () => syncGroupMetadata(sock, accountId, groupJids, options),
    (error) => {
      console.error(`[MetadataSync] Background group sync failed for ${accountId}:`, error);
    }
  );
}

/**
 * Main group metadata sync function
 */
export async function syncGroupMetadata(
  sock: WASocket,
  accountId: string,
  groupJids: string[],
  options: MetadataSyncOptions = {}
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const {
    concurrency = BATCH_CONFIG.GROUP_BATCH_SIZE,
    rateLimitDelayMs = 100,
  } = options;

  console.log(`[MetadataSync] Syncing ${groupJids.length} groups for ${accountId}`);

  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  // Process in chunks to allow for batch database operations
  const chunks = chunk(groupJids, BATCH_CONFIG.HISTORY_GROUP_BATCH_SIZE);

  for (const groupBatch of chunks) {
    // Fetch metadata in parallel with controlled concurrency
    const metadataResults = await processWithConcurrency(
      groupBatch,
      concurrency,
      async (jid, index) => {
        // Small rate limit delay between requests
        if (index > 0) {
          await sleep(rateLimitDelayMs);
        }

        try {
          const metadata = await retryWithBackoff(
            () => sock.groupMetadata(jid),
            {
              maxRetries: 2,
              initialDelayMs: 500,
              maxDelayMs: 5000,
            }
          );
          return { jid, metadata, error: null };
        } catch (error) {
          return { jid, metadata: null, error: (error as Error).message };
        }
      },
      {
        onProgress: (completed, total) => {
          options.onProgress?.({
            accountId,
            type: 'groups',
            processed: processed + completed,
            total: groupJids.length,
            percentage: Math.round(((processed + completed) / groupJids.length) * 100),
          });
        },
        onError: (error, jid) => {
          errors.push(`Group ${jid}: ${error.message}`);
        },
        continueOnError: true,
      }
    );

    // Separate successful and failed results
    const successfulMetadata = metadataResults.filter((r) => r.metadata !== null);
    const failedMetadata = metadataResults.filter((r) => r.metadata === null);

    failed += failedMetadata.length;
    failedMetadata.forEach((r) => {
      if (r.error) errors.push(`Group ${r.jid}: ${r.error}`);
    });

    // Batch upsert successful metadata
    if (successfulMetadata.length > 0) {
      const groupInserts = successfulMetadata.map((r) => ({
        id: r.metadata!.id,
        subject: r.metadata!.subject,
        desc: r.metadata!.desc,
        owner: r.metadata!.owner,
        participants: r.metadata!.participants || [],
      }));

      try {
        await batchUpsertGroups(accountId, groupInserts);
        processed += successfulMetadata.length;
      } catch (error) {
        console.error(`[MetadataSync] Batch group upsert error:`, error);
        errors.push(`Batch upsert: ${(error as Error).message}`);
        failed += successfulMetadata.length;
      }
    }

    // Yield to event loop between chunks
    await yieldToEventLoop();
  }

  console.log(`[MetadataSync] Group sync complete for ${accountId}: ${processed} success, ${failed} failed`);

  return { processed, failed, errors };
}

/**
 * Sync contact profiles (profile pictures) in background
 *
 * @param sock - WhatsApp socket
 * @param accountId - Account ID
 * @param contactJids - Array of contact JIDs to sync
 * @param options - Sync options
 */
export function syncContactProfilesBackground(
  sock: WASocket,
  accountId: string,
  contactJids: string[],
  options: MetadataSyncOptions = {}
): void {
  runInBackground(
    () => syncContactProfiles(sock, accountId, contactJids, options),
    (error) => {
      console.error(`[MetadataSync] Background profile sync failed for ${accountId}:`, error);
    }
  );
}

/**
 * Main contact profile sync function
 *
 * Fetches profile pictures for contacts in parallel.
 * Note: Fetching status text is more rate-limited by WhatsApp.
 */
export async function syncContactProfiles(
  sock: WASocket,
  accountId: string,
  contactJids: string[],
  options: MetadataSyncOptions = {}
): Promise<{ updated: number; errors: string[] }> {
  const {
    concurrency = 10, // Lower concurrency for profile pics
    rateLimitDelayMs = 200, // Higher delay for profile pic requests
  } = options;

  console.log(`[MetadataSync] Syncing ${contactJids.length} contact profiles for ${accountId}`);

  const errors: string[] = [];
  let updated = 0;

  // Process in chunks
  const chunks = chunk(contactJids, BATCH_CONFIG.CONTACT_BATCH_SIZE);

  for (const contactBatch of chunks) {
    // Fetch profile pictures in parallel
    const profileResults = await processWithConcurrency(
      contactBatch,
      concurrency,
      async (jid, index) => {
        // Rate limit delay
        if (index > 0 && index % concurrency === 0) {
          await sleep(rateLimitDelayMs);
        }

        try {
          // Fetch profile picture URL
          const profilePic = await sock.profilePictureUrl(jid, 'preview').catch(() => null);

          return { jid, profilePic, error: null };
        } catch (error) {
          return { jid, profilePic: null, error: (error as Error).message };
        }
      },
      {
        onProgress: (completed, total) => {
          options.onProgress?.({
            accountId,
            type: 'profiles',
            processed: updated + completed,
            total: contactJids.length,
            percentage: Math.round(((updated + completed) / contactJids.length) * 100),
          });
        },
        continueOnError: true,
      }
    );

    // Filter contacts that have profile pictures
    const profilesWithPics = profileResults.filter((r) => r.profilePic !== null);

    // Batch update profiles
    if (profilesWithPics.length > 0) {
      const profileUpdates = profilesWithPics.map((r) => ({
        jid: r.jid,
        profilePic: r.profilePic,
        status: null, // Status requires separate API call
      }));

      try {
        await batchUpdateContactProfiles(accountId, profileUpdates);
        updated += profileUpdates.length;
      } catch (error) {
        console.error(`[MetadataSync] Batch profile update error:`, error);
        errors.push(`Batch update: ${(error as Error).message}`);
      }
    }

    // Yield to event loop
    await yieldToEventLoop();
  }

  console.log(`[MetadataSync] Profile sync complete for ${accountId}: ${updated} updated`);

  return { updated, errors };
}

/**
 * Full metadata sync - syncs both groups and contact profiles
 *
 * Call this after initial connection or on demand.
 */
export async function syncAllMetadata(
  sock: WASocket,
  accountId: string,
  data: {
    groupJids?: string[];
    contactJids?: string[];
  },
  options: MetadataSyncOptions = {}
): Promise<MetadataSyncResult> {
  const startTime = Date.now();
  const allErrors: string[] = [];

  let groupsProcessed = 0;
  let groupsFailed = 0;
  let contactsProcessed = 0;
  let profilesUpdated = 0;

  // Sync groups
  if (data.groupJids && data.groupJids.length > 0) {
    const groupResult = await syncGroupMetadata(sock, accountId, data.groupJids, {
      ...options,
      onProgress: (progress) => {
        if (progress.type === 'groups') {
          options.onProgress?.(progress);
        }
      },
    });
    groupsProcessed = groupResult.processed;
    groupsFailed = groupResult.failed;
    allErrors.push(...groupResult.errors);
  }

  // Sync contact profiles
  if (data.contactJids && data.contactJids.length > 0) {
    contactsProcessed = data.contactJids.length;

    const profileResult = await syncContactProfiles(sock, accountId, data.contactJids, {
      ...options,
      onProgress: (progress) => {
        if (progress.type === 'profiles') {
          options.onProgress?.(progress);
        }
      },
    });
    profilesUpdated = profileResult.updated;
    allErrors.push(...profileResult.errors);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[MetadataSync] Full sync complete for ${accountId} in ${durationMs}ms`);

  return {
    accountId,
    groupsProcessed,
    groupsFailed,
    contactsProcessed,
    profilesUpdated,
    durationMs,
    errors: allErrors,
  };
}

/**
 * Background full metadata sync
 */
export function syncAllMetadataBackground(
  sock: WASocket,
  accountId: string,
  data: {
    groupJids?: string[];
    contactJids?: string[];
  },
  options: MetadataSyncOptions = {}
): void {
  runInBackground(
    () => syncAllMetadata(sock, accountId, data, options),
    (error) => {
      console.error(`[MetadataSync] Background full sync failed for ${accountId}:`, error);
    }
  );
}

/**
 * Extract contacts from Baileys store
 *
 * This is a helper to get contact JIDs from various sources.
 */
export function extractContactJids(contacts: Contact[]): string[] {
  return contacts
    .filter((c) => c.id && !c.id.endsWith('@g.us') && !c.id.endsWith('@broadcast'))
    .map((c) => c.id!)
    .filter((id) => id.includes('@s.whatsapp.net'));
}

/**
 * Extract group JIDs from Baileys store
 */
export function extractGroupJidsFromContacts(contacts: Contact[]): string[] {
  return contacts
    .filter((c) => c.id?.endsWith('@g.us'))
    .map((c) => c.id!);
}

/**
 * Sync contact information from Baileys contacts update
 */
export async function syncContactsFromBaileys(
  accountId: string,
  contacts: Contact[],
  options: MetadataSyncOptions = {}
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  // Filter valid contacts
  const validContacts = contacts.filter(
    (c) => c.id && c.id.endsWith('@s.whatsapp.net')
  );

  if (validContacts.length === 0) {
    return { processed: 0, errors: [] };
  }

  // Process in chunks
  const chunks = chunk(validContacts, BATCH_CONFIG.CONTACT_BATCH_SIZE);

  for (const batch of chunks) {
    const contactInserts: ContactInsert[] = batch.map((c) => ({
      accountId,
      channelType: 'whatsapp' as const,
      channelContactId: c.id!,
      name: c.name || c.notify || undefined,
      phoneNumber: c.id!.replace('@s.whatsapp.net', ''),
      jidType: 'user',
      waId: c.id!,
    }));

    try {
      await batchInsertContacts(contactInserts);
      processed += batch.length;

      options.onProgress?.({
        accountId,
        type: 'contacts',
        processed,
        total: validContacts.length,
        percentage: Math.round((processed / validContacts.length) * 100),
      });
    } catch (error) {
      console.error(`[MetadataSync] Contact batch insert error:`, error);
      errors.push(`Batch insert: ${(error as Error).message}`);
    }

    await yieldToEventLoop();
  }

  return { processed, errors };
}
