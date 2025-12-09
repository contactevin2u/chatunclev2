import { queryOne, execute } from '../config/database';
import { sessionManager } from './whatsapp/SessionManager';
import { uploadMedia } from './cloudinary';

// Cache duration: 7 days
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Rate limiting: prevent concurrent fetches for same contact/group
const fetchingInProgress = new Map<string, Promise<string | null>>();

/**
 * Fetch profile picture URL from WhatsApp via Baileys
 * Downloads the image and uploads to Cloudinary for caching
 */
async function fetchProfilePicFromWhatsApp(
  accountId: string,
  jid: string,
  entityType: 'contact' | 'group'
): Promise<string | null> {
  try {
    const socket = sessionManager.getSession(accountId);
    if (!socket) {
      console.log(`[ProfilePic] No session for account ${accountId}`);
      return null;
    }

    // Get profile picture URL from WhatsApp (high resolution)
    const waUrl = await socket.profilePictureUrl(jid, 'image').catch(() => null);

    if (!waUrl) {
      console.log(`[ProfilePic] No profile pic for ${jid}`);
      return null;
    }

    // Download the image
    const response = await fetch(waUrl);
    if (!response.ok) {
      console.log(`[ProfilePic] Failed to download: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Upload to Cloudinary
    const folder = entityType === 'group' ? 'chatuncle/group_pics' : 'chatuncle/profile_pics';
    const publicId = `${entityType}_${jid.replace('@', '_').replace('.', '_')}`;

    const cloudinaryUrl = await uploadMedia(buffer, {
      folder,
      resourceType: 'image',
      publicId,
    });

    if (cloudinaryUrl) {
      console.log(`[ProfilePic] Uploaded to Cloudinary: ${cloudinaryUrl}`);
    }

    return cloudinaryUrl;
  } catch (error) {
    console.error(`[ProfilePic] Error fetching profile pic for ${jid}:`, error);
    return null;
  }
}

/**
 * Get profile picture for a contact
 * Returns cached URL if available and fresh, otherwise fetches from WhatsApp
 */
export async function getContactProfilePic(
  accountId: string,
  contactId: string
): Promise<string | null> {
  try {
    // Check if we have a cached profile pic
    const contact = await queryOne(`
      SELECT wa_id, jid_type, profile_pic_url, profile_pic_fetched_at
      FROM contacts WHERE id = $1
    `, [contactId]);

    if (!contact) {
      return null;
    }

    // Check if cache is still valid
    if (contact.profile_pic_url && contact.profile_pic_fetched_at) {
      const fetchedAt = new Date(contact.profile_pic_fetched_at).getTime();
      if (Date.now() - fetchedAt < CACHE_DURATION_MS) {
        return contact.profile_pic_url;
      }
    }

    // Construct JID
    const jid = contact.jid_type === 'lid'
      ? `${contact.wa_id}@lid`
      : `${contact.wa_id}@s.whatsapp.net`;

    // Prevent concurrent fetches
    const cacheKey = `contact:${contactId}`;
    if (fetchingInProgress.has(cacheKey)) {
      return fetchingInProgress.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const picUrl = await fetchProfilePicFromWhatsApp(accountId, jid, 'contact');

        // Update database (even if null, to prevent repeated fetches)
        await execute(`
          UPDATE contacts
          SET profile_pic_url = $1, profile_pic_fetched_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `, [picUrl, contactId]);

        return picUrl;
      } finally {
        fetchingInProgress.delete(cacheKey);
      }
    })();

    fetchingInProgress.set(cacheKey, fetchPromise);
    return fetchPromise;
  } catch (error) {
    console.error(`[ProfilePic] Error getting contact profile pic:`, error);
    return null;
  }
}

/**
 * Get profile picture for a group
 * Returns cached URL if available and fresh, otherwise fetches from WhatsApp
 */
export async function getGroupProfilePic(
  accountId: string,
  groupId: string
): Promise<string | null> {
  try {
    // Check if we have a cached profile pic
    const group = await queryOne(`
      SELECT group_jid, profile_pic_url, profile_pic_fetched_at
      FROM groups WHERE id = $1
    `, [groupId]);

    if (!group) {
      return null;
    }

    // Check if cache is still valid
    if (group.profile_pic_url && group.profile_pic_fetched_at) {
      const fetchedAt = new Date(group.profile_pic_fetched_at).getTime();
      if (Date.now() - fetchedAt < CACHE_DURATION_MS) {
        return group.profile_pic_url;
      }
    }

    // Prevent concurrent fetches
    const cacheKey = `group:${groupId}`;
    if (fetchingInProgress.has(cacheKey)) {
      return fetchingInProgress.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const picUrl = await fetchProfilePicFromWhatsApp(accountId, group.group_jid, 'group');

        // Update database
        await execute(`
          UPDATE groups
          SET profile_pic_url = $1, profile_pic_fetched_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `, [picUrl, groupId]);

        return picUrl;
      } finally {
        fetchingInProgress.delete(cacheKey);
      }
    })();

    fetchingInProgress.set(cacheKey, fetchPromise);
    return fetchPromise;
  } catch (error) {
    console.error(`[ProfilePic] Error getting group profile pic:`, error);
    return null;
  }
}

/**
 * Batch fetch profile pictures for multiple contacts (background job)
 * Useful for syncing profile pics after initial load
 */
export async function batchFetchContactProfilePics(
  accountId: string,
  limit: number = 10
): Promise<void> {
  try {
    // Get contacts without profile pics or with stale pics
    const contacts = await queryOne(`
      SELECT id FROM contacts
      WHERE whatsapp_account_id = $1
        AND (profile_pic_url IS NULL OR profile_pic_fetched_at < NOW() - INTERVAL '7 days')
      ORDER BY updated_at DESC
      LIMIT $2
    `, [accountId, limit]) as any;

    if (!contacts) return;

    const contactList = Array.isArray(contacts) ? contacts : [contacts];

    for (const contact of contactList) {
      // Add delay between fetches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getContactProfilePic(accountId, contact.id);
    }
  } catch (error) {
    console.error(`[ProfilePic] Error in batch fetch:`, error);
  }
}

/**
 * Get profile pic URL for a conversation (contact or group)
 * This is a convenience method that handles both types
 */
export async function getConversationProfilePic(
  accountId: string,
  conversationId: string
): Promise<string | null> {
  try {
    const conversation = await queryOne(`
      SELECT c.contact_id, c.group_id, c.is_group,
             ct.profile_pic_url as contact_pic, ct.profile_pic_fetched_at as contact_pic_at,
             g.profile_pic_url as group_pic, g.profile_pic_fetched_at as group_pic_at
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE c.id = $1
    `, [conversationId]);

    if (!conversation) return null;

    if (conversation.is_group && conversation.group_id) {
      // Check cache validity
      if (conversation.group_pic && conversation.group_pic_at) {
        const fetchedAt = new Date(conversation.group_pic_at).getTime();
        if (Date.now() - fetchedAt < CACHE_DURATION_MS) {
          return conversation.group_pic;
        }
      }
      return getGroupProfilePic(accountId, conversation.group_id);
    } else if (conversation.contact_id) {
      // Check cache validity
      if (conversation.contact_pic && conversation.contact_pic_at) {
        const fetchedAt = new Date(conversation.contact_pic_at).getTime();
        if (Date.now() - fetchedAt < CACHE_DURATION_MS) {
          return conversation.contact_pic;
        }
      }
      return getContactProfilePic(accountId, conversation.contact_id);
    }

    return null;
  } catch (error) {
    console.error(`[ProfilePic] Error getting conversation profile pic:`, error);
    return null;
  }
}
