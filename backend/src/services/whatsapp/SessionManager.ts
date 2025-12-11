import makeWASocket, {
  DisconnectReason,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessageKey,
  Browsers,
  isJidBroadcast,
  isJidGroup,
  isLidUser,
  isPnUser,
  getContentType,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { usePostgresAuthState, clearPostgresAuthState } from './PostgresAuthState';
import { query, queryOne, execute } from '../../config/database';
import { getIO } from '../socket';
import { processAutoReply } from '../autoReplyProcessor';
import {
  preSendCheck,
  postSendRecord,
  preSendCheckGroup,
  postSendRecordGroup,
  getTypingDuration,
  sleep,
  getRandomDelay,
  getReplyDelay,
  getAntiBanStats,
  isInWarmupPeriod,
} from '../antiBan';
import {
  isCloudinaryConfigured,
  uploadImage,
  uploadSticker,
  uploadAudio,
  uploadVideo,
  uploadDocument,
} from '../cloudinary';
import pino from 'pino';
import NodeCache from 'node-cache';

// Message retry counter cache - prevents decryption/encryption loops across socket restarts
// MUST be kept outside the socket instance (per Baileys docs)
const msgRetryCounterCache = new NodeCache({
  stdTTL: 300,      // 5 minute TTL
  checkperiod: 60,  // Check for expired keys every minute
  useClones: false, // No cloning for performance
});

// Performance services
import { messageStore } from './MessageStore';
import { groupMetadataCache } from './GroupMetadataCache';
import { messageQueue } from './MessageQueue';
import { messageDeduplicator } from './MessageDeduplicator';
import { healthMonitor } from './HealthMonitor';
import { setupBufferedEventProcessing } from './BufferedEventHandler';
import { reconnectManager } from './ReconnectManager';

/**
 * Check if JID is a user (supports both @s.whatsapp.net and @lid formats)
 * WhatsApp introduced LID (Link ID) format for privacy - we need to handle both
 * Uses Baileys v7 built-in functions: isLidUser() and isPnUser()
 */
function isUserJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  // Use Baileys v7 functions to check both LID and PN (phone number) formats
  return isLidUser(jid) === true || isPnUser(jid) === true;
}

/**
 * Extract the user ID from a JID (works with both @s.whatsapp.net and @lid)
 * Uses Baileys jidNormalizedUser to strip device suffix (e.g., :0, :1)
 */
function extractUserIdFromJid(jid: string): string {
  // First normalize the JID to strip device suffix (e.g., 60182320607:0@s.whatsapp.net -> 60182320607@s.whatsapp.net)
  const normalized = jidNormalizedUser(jid);
  // Then extract just the user ID part
  return normalized.replace('@s.whatsapp.net', '').replace('@lid', '');
}

/**
 * Get the JID type from a JID using Baileys v7 functions
 * Returns 'lid' for @lid format, 'pn' for @s.whatsapp.net (phone number)
 */
function getJidType(jid: string): 'lid' | 'pn' {
  return isLidUser(jid) === true ? 'lid' : 'pn';
}

/**
 * Construct a full JID from wa_id and jid_type
 */
function constructJid(waId: string, jidType: 'lid' | 'pn' = 'pn'): string {
  if (waId.includes('@')) return waId;
  return jidType === 'lid' ? `${waId}@lid` : `${waId}@s.whatsapp.net`;
}

/**
 * Generate account-specific delay for human-like behavior
 * Each account gets a consistent offset based on its ID
 * This prevents multiple accounts from acting synchronously
 */
function getAccountSpecificDelay(accountId: string, baseDelay: number = 500, maxExtra: number = 3000): number {
  // Simple hash of accountId to get consistent offset per account
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const accountOffset = Math.abs(hash) % maxExtra;
  const randomVariation = Math.floor(Math.random() * 1000);
  return baseDelay + accountOffset + randomVariation;
}

/**
 * Extract group JID parts
 */
function extractGroupId(groupJid: string): string {
  return groupJid.replace('@g.us', '');
}

// Create logger - use info level to see important logs
const logger = pino({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
});

interface MessagePayload {
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location';
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  // Location fields
  latitude?: number;
  longitude?: number;
  locationName?: string;
  // Reply to message (quoted message)
  quotedMessageId?: string;
  quotedMessageKey?: {
    remoteJid: string;
    id: string;
    fromMe?: boolean;
    participant?: string;
  };
}

interface SessionState {
  socket: WASocket;
  isReady: boolean;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  incognitoMode?: boolean;  // Don't send read receipts when true
}

class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private deletingAccounts: Set<string> = new Set(); // Track accounts being deleted to prevent race conditions
  private isShuttingDown: boolean = false;

  constructor() {
    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    // Setup health monitor reconnect callback
    healthMonitor.setReconnectCallback(async (accountId: string, reason: string) => {
      console.log(`[WA] Health monitor triggered reconnect for ${accountId}: ${reason}`);
      const account = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM whatsapp_accounts WHERE id = $1',
        [accountId]
      );
      if (account) {
        await this.reconnectSession(accountId, account.user_id);
      }
    });
  }

  /**
   * Setup handlers for graceful shutdown
   * Ensures sessions are properly saved before process exits
   */
  private setupShutdownHandlers() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`[WA] Received ${signal}, gracefully shutting down sessions...`);

      // Destroy all sessions gracefully (this saves state)
      const accountIds = Array.from(this.sessions.keys());
      for (const accountId of accountIds) {
        try {
          await this.destroySession(accountId);
        } catch (e) {
          console.error(`[WA] Error destroying session ${accountId}:`, e);
        }
      }

      // Cleanup all caches
      messageStore.cleanup();
      groupMetadataCache.cleanupAll();
      messageQueue.cleanupAll();
      messageDeduplicator.shutdown();
      healthMonitor.shutdown();

      console.log('[WA] All sessions and caches closed gracefully');
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  // Wait for session to be ready with timeout
  private async waitForReady(accountId: string, timeoutMs: number = 30000): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.isReady) {
      return;
    }

    // Wait for ready with timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Session sync timeout - please try again')), timeoutMs);
    });

    await Promise.race([session.readyPromise, timeoutPromise]);
  }

  async createSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Creating session for account ${accountId}, user ${userId}`);

    // Fetch account settings for incognito mode
    const accountSettings = await queryOne<{ incognito_mode: boolean }>(
      `SELECT incognito_mode FROM whatsapp_accounts WHERE id = $1`,
      [accountId]
    );
    const incognitoMode = accountSettings?.incognito_mode || false;
    if (incognitoMode) {
      console.log(`[WA] Incognito mode ENABLED for account ${accountId} - read receipts disabled`);
    }

    // Fetch latest WhatsApp Web version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA] Using WA Web v${version.join('.')}, isLatest: ${isLatest}`);

    // Use PostgreSQL-based auth state (persists across deploys)
    const { state, saveCreds } = await usePostgresAuthState(accountId);

    // Create socket with proper configuration based on latest Baileys documentation
    // Reference: https://baileys.wiki/docs/api/type-aliases/SocketConfig/
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // Use Desktop browser to get full history sync (per Baileys docs)
      // "If you want to emulate a desktop to get full chat history events, use Browsers.macOS('Desktop')"
      browser: Browsers.macOS('Desktop'),
      // Enable full history sync - runs in background (non-blocking) so doesn't affect real-time
      syncFullHistory: true,
      // Don't mark as online on connect - allows user to receive notifications on phone
      markOnlineOnConnect: false,
      // Disable link preview generation (reduces processing overhead)
      generateHighQualityLinkPreview: false,
      // getMessage callback for poll decryption and message retries
      // Uses MessageStore for caching with DB fallback (better retry handling)
      getMessage: messageStore.createGetMessageCallback(accountId),
      // cachedGroupMetadata for faster group operations (5-min TTL cache)
      // Reduces API calls to WhatsApp servers and improves performance
      cachedGroupMetadata: groupMetadataCache.createCacheFunction(accountId),
      // Message retry counter - prevents decryption/encryption loops (per Baileys docs)
      // MUST be external to socket to persist across reconnects
      msgRetryCounterCache,

      // ============ MAXIMUM PERFORMANCE OPTIMIZATIONS ============
      // Reference: https://baileys.wiki/docs/socket/configuration/
      // Reference: https://www.builderbot.app/en/providers/baileys

      // Emit own events for batch processing with sock.ev.process()
      emitOwnEvents: true,

      // SPEED: Aggressive connection timeouts for fast reconnects
      connectTimeoutMs: 30000,        // 30 seconds (reduced from 60)
      defaultQueryTimeoutMs: 30000,   // 30 seconds for queries
      keepAliveIntervalMs: 20000,     // 20 second ping-pong (faster detection of dead connections)
      retryRequestDelayMs: 100,       // 100ms between retries (FAST)

      // QR code timeout
      qrTimeout: 45000,               // 45 seconds per QR code

      // SPEED: Fast message retries
      maxMsgRetryCount: 3,            // Reduced retries for speed (was 5)

      // SPEED: Fire init queries immediately for faster connection
      fireInitQueries: true,

      // SPEED: Transaction optimization for batch commits
      transactionOpts: {
        maxCommitRetries: 2,          // Fast fail
        delayBetweenTriesMs: 100,     // Minimal delay
      },

      // Accept ALL history sync messages - required for full history to work
      // Returning true means Baileys will buffer events for ~20 seconds on connect
      // but this ensures we receive all history chunks
      shouldSyncHistoryMessage: () => true,

      // Filter JIDs to ignore - skip status broadcasts and newsletters
      // Reduces event processing overhead significantly
      shouldIgnoreJid: (jid) => {
        // Handle undefined/null jid
        if (!jid) return false;
        // Ignore status broadcasts (@broadcast)
        if (isJidBroadcast(jid)) return true;
        // Ignore newsletter channels (@newsletter)
        if (jid.endsWith('@newsletter')) return true;
        // Ignore call status
        if (jid.endsWith('@call')) return true;
        return false;
      },

      // Patch messages before sending for optimization
      // Removes unnecessary fields that bloat message size
      patchMessageBeforeSending: (msg) => {
        const clean = (obj: any): any => {
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') return obj;
          const result: any = Array.isArray(obj) ? [] : {};
          for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val !== null && val !== undefined && val !== '') {
              if (typeof val === 'object') {
                const cleaned = clean(val);
                if (Object.keys(cleaned).length > 0 || Array.isArray(cleaned)) {
                  result[key] = cleaned;
                }
              } else {
                result[key] = val;
              }
            }
          }
          return result;
        };
        return clean(msg);
      },
    });

    // Create session state with ready promise
    let resolveReady: () => void = () => {};
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const sessionState: SessionState = {
      socket: sock,
      isReady: false,
      readyPromise,
      resolveReady,
      incognitoMode,  // Store incognito mode flag for read receipt control
    };

    // Store session state
    this.sessions.set(accountId, sessionState);

    // Setup buffered event processing (sock.ev.process) for better performance
    // This replaces all individual sock.ev.on() handlers with a single batched processor
    setupBufferedEventProcessing(
      {
        accountId,
        userId,
        sock,
        saveCreds,
        onReconnect: () => {
          // Skip reconnect if account is being intentionally destroyed
          // This prevents double-reconnect loops when destroySession closes the socket
          if (this.deletingAccounts.has(accountId)) {
            console.log(`[WA] Skipping reconnect for ${accountId} (account is being destroyed)`);
            return;
          }

          const canReconnect = reconnectManager.canReconnect(accountId);
          if (canReconnect.allowed) {
            const delay = reconnectManager.scheduleReconnect(accountId, async () => {
              await this.reconnectSession(accountId, userId);
            });
            if (delay > 0) {
              console.log(`[WA] Scheduled reconnect for ${accountId} in ${delay}ms (exponential backoff)`);
            }
          } else {
            console.log(`[WA] Reconnection blocked for ${accountId}: ${canReconnect.reason}`);
          }
        },
        onLogout: () => {
          reconnectManager.clearState(accountId);
          this.cleanupSession(accountId);
        },
        onReady: () => {
          reconnectManager.resetState(accountId);
        },
        setReady: (ready: boolean) => {
          const session = this.sessions.get(accountId);
          if (session) {
            session.isReady = ready;
            if (ready) {
              session.resolveReady();
            }
          }
        },
      },
      {
        handleIncomingMessage: this.handleIncomingMessage.bind(this),
        handleOutgoingMessage: this.handleOutgoingMessage.bind(this),
        handleGroupIncomingMessage: this.handleGroupIncomingMessage.bind(this),
        handleGroupOutgoingMessage: this.handleGroupOutgoingMessage.bind(this),
        handleReaction: this.handleReaction.bind(this),
        handleGroupUpsert: this.handleGroupUpsert.bind(this),
        handleGroupUpdate: this.handleGroupUpdate.bind(this),
        handleGroupParticipantsUpdate: this.handleGroupParticipantsUpdate.bind(this),
        handleLidMapping: this.handleLidMapping.bind(this),
      }
    );

    console.log(`[WA] Session ${accountId} buffered event processing setup complete`);
  }

  private mapMessageStatus(status: number): string {
    switch (status) {
      case 0: return 'pending';
      case 1: return 'sent';
      case 2: return 'delivered';
      case 3:
      case 4: return 'read';
      default: return 'sent';
    }
  }

  private async handleIncomingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;  // Extract for TypeScript type narrowing
    const remoteJid = msgKey.remoteJid;

    // Use Baileys helpers for jid validation
    if (!remoteJid || isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) return;
    if (!isUserJid(remoteJid)) return;

    // Extract phone number from jid and determine JID type
    const waId = extractUserIdFromJid(remoteJid);
    const jidType = getJidType(remoteJid);

    // Get pushName from the message (sender's WhatsApp display name)
    const pushName = msg.pushName || null;

    console.log(`[WA] Processing message from ${waId} (${jidType}), pushName: ${pushName}, realtime: ${isRealTime}`);

    // Try to get PN from Baileys' internal LID mapping store if this is a LID
    let resolvedPn: string | null = null;
    if (jidType === 'lid') {
      try {
        const session = this.sessions.get(accountId);
        if (session?.socket?.signalRepository?.lidMapping) {
          const pnJid = await session.socket.signalRepository.lidMapping.getPNForLID(remoteJid);
          if (pnJid) {
            resolvedPn = extractUserIdFromJid(pnJid);
            console.log(`[WA] Baileys lidMapping resolved LID ${waId} -> PN ${resolvedPn}`);
            // Store this mapping in our database for future use
            await execute(
              `INSERT INTO lid_pn_mappings (whatsapp_account_id, lid, pn)
               VALUES ($1, $2, $3)
               ON CONFLICT (whatsapp_account_id, lid) DO UPDATE SET pn = $3, updated_at = NOW()`,
              [accountId, waId, resolvedPn]
            );
          }
        }
      } catch (err) {
        console.log(`[WA] Could not resolve LID via Baileys lidMapping:`, err);
      }
    }

    // Get or create contact with LID/PN deduplication
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2',
      [accountId, waId]
    );

    if (!contact) {
      // Before creating a new contact, check if we have a LID/PN mapping
      // that points to an existing contact (prevents duplicates)
      let mappedContact = null;

      if (jidType === 'lid') {
        // This is a LID - first try Baileys-resolved PN, then our DB mapping
        let pnToLookup = resolvedPn;
        if (!pnToLookup) {
          const mapping = await queryOne(
            `SELECT pn FROM lid_pn_mappings WHERE whatsapp_account_id = $1 AND lid = $2`,
            [accountId, waId]
          );
          pnToLookup = mapping?.pn || null;
        }
        if (pnToLookup) {
          mappedContact = await queryOne(
            `SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2`,
            [accountId, pnToLookup]
          );
          if (mappedContact) {
            console.log(`[WA] Found existing PN contact ${mappedContact.id} for LID ${waId} via mapping`);
          }
        }
      } else if (jidType === 'pn') {
        // This is a PN - check if we have a mapping from a LID contact
        const mapping = await queryOne(
          `SELECT lid FROM lid_pn_mappings WHERE whatsapp_account_id = $1 AND pn = $2`,
          [accountId, waId]
        );
        if (mapping?.lid) {
          mappedContact = await queryOne(
            `SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2`,
            [accountId, mapping.lid]
          );
          if (mappedContact) {
            console.log(`[WA] Found existing LID contact ${mappedContact.id} for PN ${waId} via mapping`);
            // Update the existing contact to use the PN as wa_id (more reliable)
            await execute(
              `UPDATE contacts SET wa_id = $1, phone_number = $1, jid_type = 'pn', updated_at = NOW()
               WHERE id = $2`,
              [waId, mappedContact.id]
            );
            mappedContact.wa_id = waId;
            mappedContact.phone_number = waId;
            mappedContact.jid_type = 'pn';
          }
        }
      }

      if (mappedContact) {
        contact = mappedContact;
      } else {
        // No mapping found - try to find by name as last resort (prevents duplicates)
        // This catches cases where LID and PN messages arrive before mapping is known
        if (pushName) {
          const nameMatch = await queryOne(
            `SELECT * FROM contacts
             WHERE whatsapp_account_id = $1 AND name = $2
             AND jid_type != $3
             ORDER BY created_at ASC LIMIT 1`,
            [accountId, pushName, jidType]
          );
          if (nameMatch) {
            console.log(`[WA] Found existing contact ${nameMatch.id} with same name "${pushName}" - linking ${jidType} ${waId}`);
            // Store the mapping for future use
            if (jidType === 'lid') {
              await execute(
                `INSERT INTO lid_pn_mappings (whatsapp_account_id, lid, pn)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (whatsapp_account_id, lid) DO UPDATE SET pn = $3, updated_at = NOW()`,
                [accountId, waId, nameMatch.wa_id]
              );
            } else {
              await execute(
                `INSERT INTO lid_pn_mappings (whatsapp_account_id, lid, pn)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (whatsapp_account_id, pn) DO UPDATE SET lid = $2, updated_at = NOW()`,
                [accountId, nameMatch.wa_id, waId]
              );
            }
            // Update existing contact with phone number if we have it
            if (jidType === 'pn' && !nameMatch.phone_number) {
              await execute(
                `UPDATE contacts SET phone_number = $1, updated_at = NOW() WHERE id = $2`,
                [waId, nameMatch.id]
              );
            }
            contact = nameMatch;
          }
        }

        if (!contact) {
          // No match found - create new contact
          // For LID contacts, if we resolved PN, store it. For PN contacts, wa_id IS the phone number
          const phoneNumber = jidType === 'pn' ? waId : resolvedPn;
          contact = await queryOne(
            `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, name, jid_type)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [accountId, waId, phoneNumber, pushName, jidType]
          );
          console.log(`[WA] Created new contact: ${contact.id} with name: ${pushName}, jid_type: ${jidType}, phone: ${phoneNumber}`);
        }
      }
    } else {
      // Update contact if needed
      let needsUpdate = false;
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (pushName && !contact.name) {
        updates.push(`name = $${paramIndex++}`);
        values.push(pushName);
        needsUpdate = true;
      }

      // Update jid_type if it changed (might have been default 'pn')
      if (contact.jid_type !== jidType) {
        updates.push(`jid_type = $${paramIndex++}`);
        values.push(jidType);
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push(`updated_at = NOW()`);
        values.push(contact.id);
        await execute(
          `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
        contact.name = pushName || contact.name;
        contact.jid_type = jidType;
        console.log(`[WA] Updated contact ${contact.id}: name=${pushName}, jid_type=${jidType}`);
      }
    }

    // Get or create conversation
    let conversation = await queryOne(
      'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2',
      [accountId, contact.id]
    );

    if (!conversation) {
      conversation = await queryOne(
        `INSERT INTO conversations (whatsapp_account_id, contact_id, unread_count, last_message_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [accountId, contact.id, isRealTime ? 1 : 0]
      );
      console.log(`[WA] Created new conversation: ${conversation.id}`);
    } else if (isRealTime) {
      await execute(
        `UPDATE conversations
         SET unread_count = unread_count + 1, last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );
    }

    // Check if message already exists
    const existingMessage = await queryOne(
      'SELECT id FROM messages WHERE wa_message_id = $1',
      [msgKey.id]
    );

    if (existingMessage) {
      console.log(`[WA] Message ${msgKey.id} already exists, skipping`);
      return;
    }

    // Determine message type and content using Baileys getContentType helper
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;

    // Use Baileys getContentType to detect message type
    const msgType = messageContent ? getContentType(messageContent) : undefined;
    console.log(`[WA] Message content type: ${msgType}`, msgType ? '' : Object.keys(messageContent || {}));

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        // Download and upload image media
        try {
          const imgBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (imgBuffer) {
            // Try Cloudinary first, fall back to Base64
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadImage(Buffer.from(imgBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA] Uploaded image to Cloudinary: ${cloudUrl}`);
              }
            }
            // Fallback to Base64 if Cloudinary fails or not configured
            if (!mediaUrl) {
              const base64 = Buffer.from(imgBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA] Stored image as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA] Failed to download image:`, e);
        }
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        // Download and upload video media
        try {
          const videoSize = messageContent?.videoMessage?.fileLength;
          // With Cloudinary: download up to 100MB, without: limit to 5MB for Base64
          const maxSize = isCloudinaryConfigured() ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
          if (!videoSize || Number(videoSize) < maxSize) {
            const vidBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
            if (vidBuffer) {
              if (isCloudinaryConfigured()) {
                const cloudUrl = await uploadVideo(Buffer.from(vidBuffer), msgKey.id || undefined);
                if (cloudUrl) {
                  mediaUrl = cloudUrl;
                  console.log(`[WA] Uploaded video to Cloudinary: ${cloudUrl}`);
                }
              }
              // Fallback to Base64 only for small videos
              if (!mediaUrl && Number(videoSize || 0) < 5 * 1024 * 1024) {
                const base64 = Buffer.from(vidBuffer).toString('base64');
                mediaUrl = `data:${mediaMimeType};base64,${base64}`;
                console.log(`[WA] Stored video as Base64: ${base64.length} chars`);
              }
            }
          } else {
            console.log(`[WA] Video too large to download: ${videoSize} bytes`);
          }
        } catch (e) {
          console.error(`[WA] Failed to download video:`, e);
        }
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        // Download and upload audio media
        try {
          const audioBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (audioBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadAudio(Buffer.from(audioBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA] Uploaded audio to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(audioBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA] Stored audio as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA] Failed to download audio:`, e);
        }
        break;
      case 'ptvMessage':
        // Circular video notes (push-to-talk video)
        contentType = 'video';
        content = '[Video Note]';
        mediaMimeType = 'video/mp4';
        break;
      case 'documentMessage':
      case 'documentWithCaptionMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName ||
                  messageContent?.documentWithCaptionMessage?.message?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype ||
                        messageContent?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ||
                        'application/octet-stream';
        // Download and upload document media
        try {
          const docBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (docBuffer) {
            if (isCloudinaryConfigured()) {
              // Pass original filename so download preserves the name
              const cloudUrl = await uploadDocument(Buffer.from(docBuffer), content, msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA] Uploaded document to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              // Base64 fallback for small documents (< 5MB)
              if (docBuffer.length < 5 * 1024 * 1024) {
                const base64 = Buffer.from(docBuffer).toString('base64');
                mediaUrl = `data:${mediaMimeType};base64,${base64}`;
                console.log(`[WA] Stored document as Base64: ${base64.length} chars`);
              } else {
                console.log(`[WA] Document too large for Base64: ${docBuffer.length} bytes`);
              }
            }
          }
        } catch (e) {
          console.error(`[WA] Failed to download document:`, e);
        }
        break;
      case 'stickerMessage':
        contentType = 'sticker';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        // Download and upload sticker media
        try {
          const stickerBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (stickerBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadSticker(Buffer.from(stickerBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA] Uploaded sticker to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(stickerBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA] Stored sticker as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA] Failed to download sticker:`, e);
        }
        break;
      case 'contactMessage':
      case 'contactsArrayMessage':
        contentType = 'text';
        content = `[Contact: ${messageContent?.contactMessage?.displayName || 'Shared Contact'}]`;
        break;
      case 'locationMessage':
      case 'liveLocationMessage':
        contentType = 'location';
        const loc = messageContent?.locationMessage || messageContent?.liveLocationMessage;
        // Store location data as JSON for frontend to parse
        // Note: name and address only exist on locationMessage, not liveLocationMessage
        content = JSON.stringify({
          latitude: loc?.degreesLatitude,
          longitude: loc?.degreesLongitude,
          name: (loc as any)?.name || null,
          address: (loc as any)?.address || null,
        });
        break;
      case 'reactionMessage':
        // Reactions are handled by messages.reaction event - skip here
        console.log(`[WA] Skipping reactionMessage in upsert (handled by messages.reaction event)`);
        return;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        // Protocol messages - skip them
        console.log(`[WA] Skipping protocol message: ${msgType}`);
        return;
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':
        contentType = 'text';
        const poll = messageContent?.pollCreationMessage || messageContent?.pollCreationMessageV2 || messageContent?.pollCreationMessageV3;
        content = `[Poll: ${poll?.name || 'Untitled Poll'}]`;
        break;
      case 'pollUpdateMessage':
        console.log(`[WA] Skipping poll update`);
        return;
      default:
        // Unknown message type - log it but still save
        console.log(`[WA] Unknown message type: ${msgType}`, Object.keys(messageContent || {}));
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    // Get message timestamp
    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Extract quoted message info from contextInfo (for replies)
    let quotedWaMessageId: string | null = null;
    let quotedContent: string | null = null;
    let quotedSenderName: string | null = null;
    let quotedMessageDbId: string | null = null;

    // contextInfo can be in different message types
    const contextInfo = messageContent?.extendedTextMessage?.contextInfo ||
                        messageContent?.imageMessage?.contextInfo ||
                        messageContent?.videoMessage?.contextInfo ||
                        messageContent?.audioMessage?.contextInfo ||
                        messageContent?.documentMessage?.contextInfo ||
                        messageContent?.stickerMessage?.contextInfo ||
                        messageContent?.locationMessage?.contextInfo;

    if (contextInfo?.stanzaId) {
      quotedWaMessageId = contextInfo.stanzaId;
      quotedSenderName = contextInfo.participant ?
        contextInfo.participant.split('@')[0] : // Extract phone number from JID
        (contextInfo.quotedMessage ? 'You' : null);

      // Try to get quoted message content
      const quotedMsg = contextInfo.quotedMessage;
      if (quotedMsg) {
        const quotedMsgType = getContentType(quotedMsg);
        quotedContent = quotedMsg?.conversation ||
                        quotedMsg?.extendedTextMessage?.text ||
                        quotedMsg?.imageMessage?.caption ||
                        quotedMsg?.videoMessage?.caption ||
                        (quotedMsgType === 'imageMessage' ? '[Image]' : null) ||
                        (quotedMsgType === 'videoMessage' ? '[Video]' : null) ||
                        (quotedMsgType === 'audioMessage' ? '[Audio]' : null) ||
                        (quotedMsgType === 'stickerMessage' ? '[Sticker]' : null) ||
                        (quotedMsgType === 'documentMessage' ? '[Document]' : null) ||
                        '[Message]';
      }

      // Try to find the quoted message in our database
      const quotedDbMsg = await queryOne<{ id: string; sender_name: string }>(
        'SELECT id, sender_name FROM messages WHERE wa_message_id = $1',
        [quotedWaMessageId]
      );
      if (quotedDbMsg) {
        quotedMessageDbId = quotedDbMsg.id;
        // Use DB sender name if available
        if (quotedDbMsg.sender_name) {
          quotedSenderName = quotedDbMsg.sender_name;
        }
      }

      console.log(`[WA] Message is reply to ${quotedWaMessageId}: "${quotedContent?.substring(0, 30)}..."`);
    }

    // Save message (ON CONFLICT handles duplicate syncs)
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, created_at, quoted_message_id, quoted_wa_message_id, quoted_content, quoted_sender_name)
       VALUES ($1, $2, 'contact', $3, $4, $5, $6, 'delivered', $7, $8, $9, $10, $11)
       ON CONFLICT (conversation_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp, quotedMessageDbId, quotedWaMessageId, quotedContent, quotedSenderName]
    );

    console.log(`[WA] Saved message ${savedMessage.id} (${contentType}): ${content?.substring(0, 50) || '[media]'}...`);

    // Cache message in MessageStore for retry handling
    if (msg.message) {
      messageStore.store(accountId, msgKey as WAMessageKey, msg.message);
    }

    // Only emit to frontend for real-time messages
    // Emit to account room so ALL agents viewing this account see the message
    if (isRealTime) {
      const io = getIO();
      const roomName = `account:${accountId}`;
      const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
      console.log(`[WA] Emitting message:new to room ${roomName} (${roomSize} clients)`);

      io.to(roomName).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        message: savedMessage,
        contact: {
          id: contact.id,
          name: contact.name,
          phone_number: contact.phone_number,
        },
      });

      // Process auto-reply rules for text messages
      if (contentType === 'text' && content) {
        try {
          await processAutoReply({
            accountId,
            conversationId: conversation.id,
            contactWaId: waId,
            jidType,
            content,
            userId,
          });
        } catch (error) {
          console.error('[WA] Auto-reply processing error:', error);
        }
      }
    }
  }

  // Handle outgoing messages sent from phone (not through ChatUncle)
  private async handleOutgoingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;  // Extract for TypeScript type narrowing
    const remoteJid = msgKey.remoteJid;

    if (!remoteJid || isJidBroadcast(remoteJid) || isJidGroup(remoteJid)) return;
    if (!isUserJid(remoteJid)) return;

    const waId = extractUserIdFromJid(remoteJid);
    const jidType = getJidType(remoteJid);

    console.log(`[WA] Processing outgoing message to ${waId} (${jidType}), realtime: ${isRealTime}`);

    // Get or create contact
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2',
      [accountId, waId]
    );

    if (!contact) {
      const phoneNumber = jidType === 'pn' ? waId : null;
      contact = await queryOne(
        `INSERT INTO contacts (whatsapp_account_id, wa_id, phone_number, jid_type)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [accountId, waId, phoneNumber, jidType]
      );
    } else if (contact.jid_type !== jidType) {
      // Update jid_type if it changed
      await execute(
        `UPDATE contacts SET jid_type = $1, updated_at = NOW() WHERE id = $2`,
        [jidType, contact.id]
      );
      contact.jid_type = jidType;
    }

    // Get or create conversation
    let conversation = await queryOne(
      'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND contact_id = $2',
      [accountId, contact.id]
    );

    if (!conversation) {
      conversation = await queryOne(
        `INSERT INTO conversations (whatsapp_account_id, contact_id, last_message_at)
         VALUES ($1, $2, NOW())
         RETURNING *`,
        [accountId, contact.id]
      );
    } else {
      await execute(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [conversation.id]
      );
    }

    // Parse message content using Baileys getContentType helper
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaMimeType = null;

    const msgType = messageContent ? getContentType(messageContent) : undefined;
    console.log(`[WA] Outgoing message content type: ${msgType}`);

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        // Download and upload image
        try {
          const imgBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (imgBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadImage(Buffer.from(imgBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][History] Uploaded image to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(imgBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][History] Stored image as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download image:`, e);
        }
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        // Download and upload video (skip if too large)
        try {
          const videoSize = messageContent?.videoMessage?.fileLength || 0;
          if (Number(videoSize) < 10 * 1024 * 1024) { // Max 10MB
            const vidBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
            if (vidBuffer) {
              if (isCloudinaryConfigured()) {
                const cloudUrl = await uploadVideo(Buffer.from(vidBuffer), msgKey.id || undefined);
                if (cloudUrl) {
                  mediaUrl = cloudUrl;
                  console.log(`[WA][History] Uploaded video to Cloudinary: ${cloudUrl}`);
                }
              }
              if (!mediaUrl && Number(videoSize) < 2 * 1024 * 1024) { // Base64 only for < 2MB
                const base64 = Buffer.from(vidBuffer).toString('base64');
                mediaUrl = `data:${mediaMimeType};base64,${base64}`;
                console.log(`[WA][History] Stored video as Base64: ${base64.length} chars`);
              }
            }
          } else {
            console.log(`[WA][History] Video too large to download: ${videoSize} bytes`);
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download video:`, e);
        }
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        // Download and upload audio media
        try {
          const audioBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (audioBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadAudio(Buffer.from(audioBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][History] Uploaded audio to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(audioBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][History] Stored audio as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download audio:`, e);
        }
        break;
      case 'ptvMessage':
        // Circular video notes (push-to-talk video)
        contentType = 'video';
        content = '[Video Note]';
        mediaMimeType = 'video/mp4';
        // Download and upload video note
        try {
          const ptvBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (ptvBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadVideo(Buffer.from(ptvBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][History] Uploaded video note to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(ptvBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][History] Stored video note as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download video note:`, e);
        }
        break;
      case 'documentMessage':
      case 'documentWithCaptionMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName ||
                  messageContent?.documentWithCaptionMessage?.message?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype ||
                        messageContent?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ||
                        'application/octet-stream';
        // Download and upload document media
        try {
          const docBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (docBuffer) {
            if (isCloudinaryConfigured()) {
              // Pass original filename so download preserves the name
              const cloudUrl = await uploadDocument(Buffer.from(docBuffer), content, msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][History] Uploaded document to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl && docBuffer.length < 5 * 1024 * 1024) {
              const base64 = Buffer.from(docBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][History] Stored document as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download document:`, e);
        }
        break;
      case 'stickerMessage':
        contentType = 'sticker';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        // Download and upload sticker
        try {
          const stickerBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (stickerBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadSticker(Buffer.from(stickerBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][History] Uploaded sticker to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(stickerBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][History] Stored sticker as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error(`[WA][History] Failed to download sticker:`, e);
        }
        break;
      case 'contactMessage':
      case 'contactsArrayMessage':
        contentType = 'text';
        content = `[Contact: ${messageContent?.contactMessage?.displayName || 'Shared Contact'}]`;
        break;
      case 'locationMessage':
      case 'liveLocationMessage':
        contentType = 'location';
        const loc = messageContent?.locationMessage || messageContent?.liveLocationMessage;
        // Store location data as JSON for frontend to parse
        // Note: name and address only exist on locationMessage, not liveLocationMessage
        content = JSON.stringify({
          latitude: loc?.degreesLatitude,
          longitude: loc?.degreesLongitude,
          name: (loc as any)?.name || null,
          address: (loc as any)?.address || null,
        });
        break;
      case 'reactionMessage':
        // Reactions are handled by messages.reaction event - skip here
        console.log(`[WA] Skipping outgoing reactionMessage (handled by messages.reaction event)`);
        return;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        // Protocol messages - skip them
        console.log(`[WA] Skipping outgoing protocol message: ${msgType}`);
        return;
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':
        contentType = 'text';
        const poll = messageContent?.pollCreationMessage || messageContent?.pollCreationMessageV2 || messageContent?.pollCreationMessageV3;
        content = `[Poll: ${poll?.name || 'Untitled Poll'}]`;
        break;
      case 'pollUpdateMessage':
        console.log(`[WA] Skipping outgoing poll update`);
        return;
      default:
        // Unknown message type - log it but still save
        console.log(`[WA] Unknown outgoing message type: ${msgType}`, Object.keys(messageContent || {}));
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    // Get message timestamp
    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Save message as sent by agent (from phone) - ON CONFLICT handles duplicate syncs
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, created_at)
       VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent', $7)
       ON CONFLICT (conversation_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp]
    );

    console.log(`[WA] Saved outgoing message ${savedMessage.id}: ${content?.substring(0, 50) || '[media]'}...`);

    // Cache message in MessageStore for retry handling
    if (msg.message) {
      messageStore.store(accountId, msgKey as WAMessageKey, msg.message);
    }

    // Emit to account room so ALL agents viewing this account see the message
    if (isRealTime) {
      const io = getIO();
      io.to(`account:${accountId}`).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        message: savedMessage,
        contact: {
          id: contact.id,
          name: contact.name,
          phone_number: contact.phone_number,
        },
      });
    }
  }

  async sendMessage(
    accountId: string,
    waId: string,
    payload: MessagePayload,
    options: { skipAntiBan?: boolean; jidType?: 'lid' | 'pn' } = {}
  ): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Wait for session to be fully synced and ready
    try {
      await this.waitForReady(accountId, 30000);
    } catch (error) {
      console.error(`[WA] Session not ready for account ${accountId}:`, error);
      throw new Error('Session is still syncing - please wait a moment and try again');
    }

    const sock = session.socket;

    // Check if socket is connected
    if (!sock.user) {
      throw new Error('Session not connected - please reconnect');
    }

    // Construct JID using the stored jid_type (lid or pn format)
    const jidType = options.jidType || 'pn';
    const jid = constructJid(waId, jidType);

    console.log(`[WA] Sending ${payload.type} message to ${jid}`);
    console.log(`[WA] Connected as: ${sock.user?.id}`);

    // === ANTI-BAN MEASURES (OPTIMIZED FOR SPEED - NON-BLOCKING) ===
    if (!options.skipAntiBan) {
      // 1. Pre-send check (rate limiting, daily limits) - still blocking
      const preCheck = await preSendCheck(accountId, waId);
      if (!preCheck.canSend) {
        console.warn(`[WA] Anti-ban blocked send: ${preCheck.reason}`);
        throw new Error(`Message blocked: ${preCheck.reason}`);
      }

      // 2. Typing indicator - RUN IN PARALLEL (don't block message send)
      // This allows instant multi-agent sync while still showing typing to contacts
      const messageLength = payload.content?.length || 50;
      const typingDuration = getTypingDuration(messageLength);

      // Fire typing indicator in background (non-blocking)
      void (async () => {
        try {
          await sock.sendPresenceUpdate('composing', jid);
          await sleep(typingDuration);
          await sock.sendPresenceUpdate('paused', jid);
        } catch (e) {
          // Typing indicator is optional, don't fail the message
        }
      })();

      // Small delay to let typing start before message (50ms max)
      await sleep(50);
    }

    let result;

    // Build quoted message for replies if provided
    let quotedMsg: any = undefined;
    console.log(`[WA] Quote check - payload.quotedMessageKey:`, payload.quotedMessageKey ? JSON.stringify(payload.quotedMessageKey) : 'none');
    if (payload.quotedMessageKey) {
      // Get the original message from MessageStore (checks cache first, then DB)
      const originalMsg = await messageStore.getMessage(accountId, payload.quotedMessageKey as WAMessageKey);
      console.log(`[WA] MessageStore.getMessage result:`, originalMsg ? 'FOUND' : 'NOT FOUND');
      if (originalMsg) {
        quotedMsg = {
          key: payload.quotedMessageKey,
          message: originalMsg,
        };
        console.log(`[WA] Replying to message: ${payload.quotedMessageKey.id}`);
        console.log(`[WA] Quote object:`, JSON.stringify(quotedMsg, null, 2));
      } else {
        // Cannot quote without message content - Baileys crashes with key-only quote
        // Skip quoting, message will still send without the reply preview
        console.log(`[WA] Cannot quote message (not in cache or DB): ${payload.quotedMessageKey.id} - sending without quote`);
        quotedMsg = undefined;
      }
    }

    try {
      switch (payload.type) {
        case 'text':
          if (!payload.content) {
            throw new Error('Text content is required');
          }
          result = await sock.sendMessage(jid, { text: payload.content }, { quoted: quotedMsg });
          break;

        case 'image':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for image');
          }
          result = await sock.sendMessage(jid, {
            image: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          }, { quoted: quotedMsg });
          break;

        case 'video':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for video');
          }
          result = await sock.sendMessage(jid, {
            video: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          }, { quoted: quotedMsg });
          break;

        case 'audio':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for audio');
          }
          result = await sock.sendMessage(jid, {
            audio: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'audio/mp4',
            ptt: true,
          }, { quoted: quotedMsg });
          break;

        case 'document':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for document');
          }
          result = await sock.sendMessage(jid, {
            document: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'application/octet-stream',
            fileName: payload.content || 'document',
          }, { quoted: quotedMsg });
          break;

        case 'location':
          if (payload.latitude === undefined || payload.longitude === undefined) {
            throw new Error('Latitude and longitude are required for location');
          }
          result = await sock.sendMessage(jid, {
            location: {
              degreesLatitude: payload.latitude,
              degreesLongitude: payload.longitude,
              name: payload.locationName || undefined,
            },
          }, { quoted: quotedMsg });
          break;

        default:
          throw new Error('Unsupported message type');
      }

      // Log full result for debugging
      console.log(`[WA] Message sent successfully:`, {
        id: result?.key?.id,
        remoteJid: result?.key?.remoteJid,
        fromMe: result?.key?.fromMe,
        status: result?.status,
        messageTimestamp: result?.messageTimestamp,
      });

      if (!result?.key?.id) {
        throw new Error('Message sent but no ID returned');
      }

      // === POST-SEND RECORDING (no additional delay) ===
      if (!options.skipAntiBan) {
        await postSendRecord(accountId, waId);
        // Go unavailable immediately - no need to wait
        try {
          await sock.sendPresenceUpdate('unavailable', jid);
        } catch (e) {
          // Ignore presence errors
        }
      }

      return result.key.id;
    } catch (error) {
      console.error(`[WA] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Send a message to a group
   * Uses group-specific anti-ban measures (rate limiting only, no new contact tracking)
   */
  async sendGroupMessage(
    accountId: string,
    groupJid: string,
    payload: MessagePayload,
    options: { skipAntiBan?: boolean } = {}
  ): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Wait for session to be fully synced and ready
    try {
      await this.waitForReady(accountId, 30000);
    } catch (error) {
      console.error(`[WA] Session not ready for account ${accountId}:`, error);
      throw new Error('Session is still syncing - please wait a moment and try again');
    }

    const sock = session.socket;

    // Check if socket is connected
    if (!sock.user) {
      throw new Error('Session not connected - please reconnect');
    }

    // Validate group JID format
    if (!groupJid.endsWith('@g.us')) {
      throw new Error('Invalid group JID format');
    }

    console.log(`[WA][Group] Sending ${payload.type} message to ${groupJid}`);

    // === ANTI-BAN MEASURES FOR GROUPS (NON-BLOCKING) ===
    if (!options.skipAntiBan) {
      // Group pre-send check (rate limiting only, no new contact check) - still blocking
      const preCheck = await preSendCheckGroup(accountId);
      if (!preCheck.canSend) {
        console.warn(`[WA][Group] Anti-ban blocked send: ${preCheck.reason}`);
        throw new Error(`Message blocked: ${preCheck.reason}`);
      }

      // Typing indicator - RUN IN PARALLEL for instant multi-agent sync
      const messageLength = payload.content?.length || 50;
      const typingDuration = Math.min(getTypingDuration(messageLength), 1500);

      // Fire typing indicator in background (non-blocking)
      void (async () => {
        try {
          await sock.sendPresenceUpdate('composing', groupJid);
          await sleep(typingDuration);
          await sock.sendPresenceUpdate('paused', groupJid);
        } catch (e) {
          // Typing indicator is optional, don't fail the message
        }
      })();

      // Small delay to let typing start before message (50ms max)
      await sleep(50);
    }

    let result;

    // Build quoted message for replies if provided
    let quotedMsg: any = undefined;
    if (payload.quotedMessageKey) {
      // Get the original message from MessageStore (checks cache first, then DB)
      const originalMsg = await messageStore.getMessage(accountId, payload.quotedMessageKey as WAMessageKey);
      if (originalMsg) {
        quotedMsg = {
          key: payload.quotedMessageKey,
          message: originalMsg,
        };
        console.log(`[WA][Group] Replying to message: ${payload.quotedMessageKey.id}`);
      } else {
        // Cannot quote without message content - Baileys crashes with key-only quote
        // Skip quoting, message will still send without the reply preview
        console.log(`[WA][Group] Cannot quote message (not in cache or DB): ${payload.quotedMessageKey.id} - sending without quote`);
        quotedMsg = undefined;
      }
    }

    try {
      switch (payload.type) {
        case 'text':
          if (!payload.content) {
            throw new Error('Text content is required');
          }
          result = await sock.sendMessage(groupJid, { text: payload.content }, { quoted: quotedMsg });
          break;

        case 'image':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for image');
          }
          result = await sock.sendMessage(groupJid, {
            image: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          }, { quoted: quotedMsg });
          break;

        case 'video':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for video');
          }
          result = await sock.sendMessage(groupJid, {
            video: { url: payload.mediaUrl },
            caption: payload.content || undefined,
          }, { quoted: quotedMsg });
          break;

        case 'audio':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for audio');
          }
          result = await sock.sendMessage(groupJid, {
            audio: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'audio/mp4',
            ptt: true,
          }, { quoted: quotedMsg });
          break;

        case 'document':
          if (!payload.mediaUrl) {
            throw new Error('Media URL is required for document');
          }
          result = await sock.sendMessage(groupJid, {
            document: { url: payload.mediaUrl },
            mimetype: payload.mediaMimeType || 'application/octet-stream',
            fileName: payload.content || 'document',
          }, { quoted: quotedMsg });
          break;

        case 'location':
          if (payload.latitude === undefined || payload.longitude === undefined) {
            throw new Error('Latitude and longitude are required for location');
          }
          result = await sock.sendMessage(groupJid, {
            location: {
              degreesLatitude: payload.latitude,
              degreesLongitude: payload.longitude,
              name: payload.locationName || undefined,
            },
          }, { quoted: quotedMsg });
          break;

        default:
          throw new Error('Unsupported message type');
      }

      console.log(`[WA][Group] Message sent successfully:`, {
        id: result?.key?.id,
        remoteJid: result?.key?.remoteJid,
        fromMe: result?.key?.fromMe,
      });

      if (!result?.key?.id) {
        throw new Error('Message sent but no ID returned');
      }

      // Post-send recording for groups (rate limiting only)
      if (!options.skipAntiBan) {
        postSendRecordGroup(accountId);
        try {
          await sock.sendPresenceUpdate('unavailable', groupJid);
        } catch (e) {
          // Ignore presence errors
        }
      }

      return result.key.id;
    } catch (error) {
      console.error(`[WA][Group] Failed to send message:`, error);
      throw error;
    }
  }

  // ============ GROUP MESSAGE HANDLERS ============

  /**
   * Handle incoming group messages
   * Stores the message but does NOT trigger AI auto-reply
   */
  private async handleGroupIncomingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;
    const groupJid = msgKey.remoteJid;

    if (!groupJid || !isJidGroup(groupJid)) return;

    // Extract sender info (who sent the message in the group)
    const senderJid = msgKey.participant || '';
    const senderWaId = senderJid ? extractUserIdFromJid(senderJid) : '';
    const pushName = msg.pushName || null;

    console.log(`[WA][Group] Incoming from ${senderWaId} in group ${extractGroupId(groupJid)}, pushName: ${pushName}`);

    // Get or create group record
    let group = await queryOne(
      'SELECT * FROM groups WHERE whatsapp_account_id = $1 AND group_jid = $2',
      [accountId, groupJid]
    );

    if (!group) {
      // Try to fetch group metadata from WhatsApp first
      let groupName = `Group ${extractGroupId(groupJid)}`;
      let groupDesc: string | null = null;
      let participantCount = 0;

      try {
        const session = this.sessions.get(accountId);
        if (session?.socket) {
          const metadata = await session.socket.groupMetadata(groupJid);
          if (metadata) {
            groupName = metadata.subject || groupName;
            groupDesc = metadata.desc || null;
            participantCount = metadata.participants?.length || 0;
            console.log(`[WA][Group] Fetched metadata for new group: ${groupName}`);
            // Cache it
            groupMetadataCache.set(accountId, groupJid, metadata as any);
          }
        }
      } catch (err) {
        console.log(`[WA][Group] Could not fetch metadata for ${groupJid}:`, err);
      }

      group = await queryOne(
        `INSERT INTO groups (whatsapp_account_id, group_jid, name, description, participant_count)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [accountId, groupJid, groupName, groupDesc, participantCount]
      );
      console.log(`[WA][Group] Created new group record: ${group.id} - ${groupName}`);
    } else if (group.name?.startsWith('Group ') && group.name?.match(/^Group \d+$/)) {
      // Group exists but has placeholder name - try to fetch real name
      try {
        const session = this.sessions.get(accountId);
        if (session?.socket) {
          const metadata = await session.socket.groupMetadata(groupJid);
          if (metadata?.subject) {
            await execute(
              `UPDATE groups SET name = $1, description = $2, participant_count = $3, updated_at = NOW()
               WHERE id = $4`,
              [metadata.subject, metadata.desc || null, metadata.participants?.length || 0, group.id]
            );
            group.name = metadata.subject;
            console.log(`[WA][Group] Updated placeholder name to: ${metadata.subject}`);
            groupMetadataCache.set(accountId, groupJid, metadata as any);
          }
        }
      } catch (err) {
        // Ignore - keep placeholder name
      }
    }

    // Get or create group conversation (use ON CONFLICT to handle race conditions)
    let conversation = await queryOne(
      `INSERT INTO conversations (whatsapp_account_id, group_id, is_group, unread_count, last_message_at)
       VALUES ($1, $2, TRUE, $3, NOW())
       ON CONFLICT (whatsapp_account_id, group_id) WHERE group_id IS NOT NULL
       DO UPDATE SET
         unread_count = CASE WHEN $3 > 0 THEN conversations.unread_count + 1 ELSE conversations.unread_count END,
         last_message_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [accountId, group.id, isRealTime ? 1 : 0]
    );
    if (!conversation) {
      // Fallback query if RETURNING didn't work
      conversation = await queryOne(
        'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND group_id = $2',
        [accountId, group.id]
      );
    }

    // Check if message already exists
    const existingMessage = await queryOne(
      'SELECT id FROM messages WHERE wa_message_id = $1',
      [msgKey.id]
    );

    if (existingMessage) {
      console.log(`[WA][Group] Message ${msgKey.id} already exists, skipping`);
      return;
    }

    // Parse message content (reuse logic from 1:1 messages)
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;

    const msgType = messageContent ? getContentType(messageContent) : undefined;

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        // Download and upload image media
        try {
          const imgBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (imgBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadImage(Buffer.from(imgBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded image to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(imgBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored image as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download image:', e);
        }
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        // Download and upload video media
        try {
          const videoSize = messageContent?.videoMessage?.fileLength;
          const maxSize = isCloudinaryConfigured() ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
          if (!videoSize || Number(videoSize) < maxSize) {
            const vidBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
            if (vidBuffer) {
              if (isCloudinaryConfigured()) {
                const cloudUrl = await uploadVideo(Buffer.from(vidBuffer), msgKey.id || undefined);
                if (cloudUrl) {
                  mediaUrl = cloudUrl;
                  console.log(`[WA][Group] Uploaded video to Cloudinary: ${cloudUrl}`);
                }
              }
              if (!mediaUrl && Number(videoSize || 0) < 5 * 1024 * 1024) {
                const base64 = Buffer.from(vidBuffer).toString('base64');
                mediaUrl = `data:${mediaMimeType};base64,${base64}`;
                console.log(`[WA][Group] Stored video as Base64: ${base64.length} chars`);
              }
            }
          } else {
            console.log(`[WA][Group] Skipping large video: ${videoSize} bytes`);
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download video:', e);
        }
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        // Download and upload audio media
        try {
          const audioBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (audioBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadAudio(Buffer.from(audioBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded audio to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(audioBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored audio as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download audio:', e);
        }
        break;
      case 'documentMessage':
      case 'documentWithCaptionMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype || 'application/octet-stream';
        // Download and upload document media
        try {
          const docBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (docBuffer) {
            if (isCloudinaryConfigured()) {
              // Pass original filename so download preserves the name
              const cloudUrl = await uploadDocument(Buffer.from(docBuffer), content, msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded document to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl && docBuffer.length < 5 * 1024 * 1024) {
              const base64 = Buffer.from(docBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored document as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download document:', e);
        }
        break;
      case 'stickerMessage':
        contentType = 'sticker';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        // Download and upload sticker media
        try {
          const stickerBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (stickerBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadSticker(Buffer.from(stickerBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded sticker to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(stickerBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored sticker as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download sticker:', e);
        }
        break;
      case 'reactionMessage':
        // Reactions are handled by messages.reaction event - skip saving as message
        console.log(`[WA][Group] Skipping reactionMessage (handled by messages.reaction event)`);
        return;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        console.log(`[WA][Group] Skipping protocol message: ${msgType}`);
        return;
      default:
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    // Get message timestamp
    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Extract quoted message info from contextInfo (for replies)
    let quotedWaMessageId: string | null = null;
    let quotedContent: string | null = null;
    let quotedSenderName: string | null = null;
    let quotedMessageDbId: string | null = null;

    const contextInfo = messageContent?.extendedTextMessage?.contextInfo ||
                        messageContent?.imageMessage?.contextInfo ||
                        messageContent?.videoMessage?.contextInfo ||
                        messageContent?.audioMessage?.contextInfo ||
                        messageContent?.documentMessage?.contextInfo ||
                        messageContent?.stickerMessage?.contextInfo ||
                        messageContent?.locationMessage?.contextInfo;

    if (contextInfo?.stanzaId) {
      quotedWaMessageId = contextInfo.stanzaId;
      quotedSenderName = contextInfo.participant ?
        contextInfo.participant.split('@')[0] :
        (contextInfo.quotedMessage ? 'You' : null);

      const quotedMsg = contextInfo.quotedMessage;
      if (quotedMsg) {
        const quotedMsgType = getContentType(quotedMsg);
        quotedContent = quotedMsg?.conversation ||
                        quotedMsg?.extendedTextMessage?.text ||
                        quotedMsg?.imageMessage?.caption ||
                        quotedMsg?.videoMessage?.caption ||
                        (quotedMsgType === 'imageMessage' ? '[Image]' : null) ||
                        (quotedMsgType === 'videoMessage' ? '[Video]' : null) ||
                        (quotedMsgType === 'audioMessage' ? '[Audio]' : null) ||
                        (quotedMsgType === 'stickerMessage' ? '[Sticker]' : null) ||
                        (quotedMsgType === 'documentMessage' ? '[Document]' : null) ||
                        '[Message]';
      }

      const quotedDbMsg = await queryOne<{ id: string; sender_name: string }>(
        'SELECT id, sender_name FROM messages WHERE wa_message_id = $1',
        [quotedWaMessageId]
      );
      if (quotedDbMsg) {
        quotedMessageDbId = quotedDbMsg.id;
        if (quotedDbMsg.sender_name) {
          quotedSenderName = quotedDbMsg.sender_name;
        }
      }

      console.log(`[WA][Group] Message is reply to ${quotedWaMessageId}: "${quotedContent?.substring(0, 30)}..."`);
    }

    // Save message with sender info (sender_jid and sender_name for groups) - ON CONFLICT handles duplicate syncs
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, sender_jid, sender_name, created_at, quoted_message_id, quoted_wa_message_id, quoted_content, quoted_sender_name)
       VALUES ($1, $2, 'contact', $3, $4, $5, $6, 'delivered', $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (conversation_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, senderJid, pushName, messageTimestamp, quotedMessageDbId, quotedWaMessageId, quotedContent, quotedSenderName]
    );

    console.log(`[WA][Group] Saved message ${savedMessage.id} from ${pushName || senderWaId}: ${content?.substring(0, 50) || '[media]'}...`);

    // Cache message for retry handling
    if (msg.message) {
      messageStore.store(accountId, msgKey as WAMessageKey, msg.message);
    }

    // Emit to account room so ALL agents viewing this account see the message
    if (isRealTime) {
      const io = getIO();
      io.to(`account:${accountId}`).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        isGroup: true,
        message: savedMessage,
        group: {
          id: group.id,
          name: group.name,
          group_jid: group.group_jid,
        },
        sender: {
          jid: senderJid,
          name: pushName,
        },
      });
    }

    // NOTE: We do NOT trigger auto-reply for group messages (as per requirements)
  }

  /**
   * Handle outgoing group messages (sent from phone or other devices)
   * Stores the message for display in inbox
   */
  private async handleGroupOutgoingMessage(
    accountId: string,
    userId: string,
    msg: proto.IWebMessageInfo,
    isRealTime: boolean = true
  ): Promise<void> {
    if (!msg.key) return;
    const msgKey = msg.key;
    const groupJid = msgKey.remoteJid;

    if (!groupJid || !isJidGroup(groupJid)) return;

    console.log(`[WA][Group] Outgoing message to group ${extractGroupId(groupJid)}`);

    // Get or create group record
    let group = await queryOne(
      'SELECT * FROM groups WHERE whatsapp_account_id = $1 AND group_jid = $2',
      [accountId, groupJid]
    );

    if (!group) {
      // Try to fetch group metadata from WhatsApp first
      let groupName = `Group ${extractGroupId(groupJid)}`;
      let groupDesc: string | null = null;
      let participantCount = 0;

      try {
        const session = this.sessions.get(accountId);
        if (session?.socket) {
          const metadata = await session.socket.groupMetadata(groupJid);
          if (metadata) {
            groupName = metadata.subject || groupName;
            groupDesc = metadata.desc || null;
            participantCount = metadata.participants?.length || 0;
            groupMetadataCache.set(accountId, groupJid, metadata as any);
          }
        }
      } catch (err) {
        // Ignore - use placeholder
      }

      group = await queryOne(
        `INSERT INTO groups (whatsapp_account_id, group_jid, name, description, participant_count)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [accountId, groupJid, groupName, groupDesc, participantCount]
      );
    } else if (group.name?.startsWith('Group ') && group.name?.match(/^Group \d+$/)) {
      // Placeholder name - try to update
      try {
        const session = this.sessions.get(accountId);
        if (session?.socket) {
          const metadata = await session.socket.groupMetadata(groupJid);
          if (metadata?.subject) {
            await execute(
              `UPDATE groups SET name = $1, description = $2, participant_count = $3, updated_at = NOW()
               WHERE id = $4`,
              [metadata.subject, metadata.desc || null, metadata.participants?.length || 0, group.id]
            );
            group.name = metadata.subject;
            groupMetadataCache.set(accountId, groupJid, metadata as any);
          }
        }
      } catch (err) {
        // Ignore
      }
    }

    // Get or create group conversation (use ON CONFLICT to handle race conditions)
    let conversation = await queryOne(
      `INSERT INTO conversations (whatsapp_account_id, group_id, is_group, last_message_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (whatsapp_account_id, group_id) WHERE group_id IS NOT NULL
       DO UPDATE SET last_message_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [accountId, group.id]
    );
    if (!conversation) {
      conversation = await queryOne(
        'SELECT * FROM conversations WHERE whatsapp_account_id = $1 AND group_id = $2',
        [accountId, group.id]
      );
    }

    // Parse message content
    const messageContent = msg.message;
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaMimeType = null;

    const msgType = messageContent ? getContentType(messageContent) : undefined;

    switch (msgType) {
      case 'conversation':
        content = messageContent?.conversation || '';
        break;
      case 'extendedTextMessage':
        content = messageContent?.extendedTextMessage?.text || '';
        break;
      case 'imageMessage':
        contentType = 'image';
        content = messageContent?.imageMessage?.caption || '[Image]';
        mediaMimeType = messageContent?.imageMessage?.mimetype || 'image/jpeg';
        // Download and upload image
        try {
          const imgBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (imgBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadImage(Buffer.from(imgBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded outgoing image to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(imgBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored outgoing image as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download outgoing image:', e);
        }
        break;
      case 'videoMessage':
        contentType = 'video';
        content = messageContent?.videoMessage?.caption || '[Video]';
        mediaMimeType = messageContent?.videoMessage?.mimetype || 'video/mp4';
        // Download and upload video (skip if too large)
        try {
          const videoSize = messageContent?.videoMessage?.fileLength || 0;
          if (Number(videoSize) < 10 * 1024 * 1024) {
            const vidBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
            if (vidBuffer) {
              if (isCloudinaryConfigured()) {
                const cloudUrl = await uploadVideo(Buffer.from(vidBuffer), msgKey.id || undefined);
                if (cloudUrl) {
                  mediaUrl = cloudUrl;
                  console.log(`[WA][Group] Uploaded outgoing video to Cloudinary: ${cloudUrl}`);
                }
              }
              if (!mediaUrl && Number(videoSize) < 2 * 1024 * 1024) {
                const base64 = Buffer.from(vidBuffer).toString('base64');
                mediaUrl = `data:${mediaMimeType};base64,${base64}`;
                console.log(`[WA][Group] Stored outgoing video as Base64: ${base64.length} chars`);
              }
            }
          } else {
            console.log(`[WA][Group] Skipping large outgoing video: ${videoSize} bytes`);
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download outgoing video:', e);
        }
        break;
      case 'audioMessage':
        contentType = 'audio';
        content = messageContent?.audioMessage?.ptt ? '[Voice Note]' : '[Audio]';
        mediaMimeType = messageContent?.audioMessage?.mimetype || 'audio/ogg';
        // Download and upload audio
        try {
          const audioBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (audioBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadAudio(Buffer.from(audioBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded outgoing audio to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(audioBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored outgoing audio as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download outgoing audio:', e);
        }
        break;
      case 'documentMessage':
        contentType = 'document';
        content = messageContent?.documentMessage?.fileName || '[Document]';
        mediaMimeType = messageContent?.documentMessage?.mimetype || 'application/octet-stream';
        // Download and upload document
        try {
          const docBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (docBuffer) {
            if (isCloudinaryConfigured()) {
              // Pass original filename so download preserves the name
              const cloudUrl = await uploadDocument(Buffer.from(docBuffer), content, msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded outgoing document to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl && docBuffer.length < 5 * 1024 * 1024) {
              const base64 = Buffer.from(docBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored outgoing document as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download outgoing document:', e);
        }
        break;
      case 'stickerMessage':
        contentType = 'sticker';
        content = '[Sticker]';
        mediaMimeType = messageContent?.stickerMessage?.mimetype || 'image/webp';
        // Download and upload sticker
        try {
          const stickerBuffer = await downloadMediaMessage(msg as any, 'buffer', {});
          if (stickerBuffer) {
            if (isCloudinaryConfigured()) {
              const cloudUrl = await uploadSticker(Buffer.from(stickerBuffer), msgKey.id || undefined);
              if (cloudUrl) {
                mediaUrl = cloudUrl;
                console.log(`[WA][Group] Uploaded outgoing sticker to Cloudinary: ${cloudUrl}`);
              }
            }
            if (!mediaUrl) {
              const base64 = Buffer.from(stickerBuffer).toString('base64');
              mediaUrl = `data:${mediaMimeType};base64,${base64}`;
              console.log(`[WA][Group] Stored outgoing sticker as Base64: ${base64.length} chars`);
            }
          }
        } catch (e) {
          console.error('[WA][Group] Failed to download outgoing sticker:', e);
        }
        break;
      case 'reactionMessage':
        // Reactions are handled by messages.reaction event - skip saving as message
        console.log(`[WA][Group] Skipping outgoing reactionMessage (handled by messages.reaction event)`);
        return;
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
        return;
      default:
        if (!content) content = `[${msgType || 'Message'}]`;
    }

    const messageTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Save message as sent by agent (our account) - ON CONFLICT handles duplicate syncs
    const savedMessage = await queryOne(
      `INSERT INTO messages (conversation_id, wa_message_id, sender_type, content_type, content, media_url, media_mime_type, status, created_at)
       VALUES ($1, $2, 'agent', $3, $4, $5, $6, 'sent', $7)
       ON CONFLICT (conversation_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [conversation.id, msgKey.id, contentType, content, mediaUrl, mediaMimeType, messageTimestamp]
    );

    console.log(`[WA][Group] Saved outgoing message ${savedMessage.id}: ${content?.substring(0, 50) || '[media]'}...`);

    // Cache message
    if (msg.message) {
      messageStore.store(accountId, msgKey as WAMessageKey, msg.message);
    }

    // Emit to account room so ALL agents viewing this account see the message
    if (isRealTime) {
      const io = getIO();
      io.to(`account:${accountId}`).emit('message:new', {
        accountId,
        conversationId: conversation.id,
        isGroup: true,
        message: savedMessage,
        group: {
          id: group.id,
          name: group.name,
          group_jid: group.group_jid,
        },
      });
    }
  }

  // ============ BUFFERED EVENT HANDLERS ============
  // These handlers are called by setupBufferedEventProcessing

  /**
   * Handle message reactions
   */
  private async handleReaction(accountId: string, userId: string, reaction: any): Promise<void> {
    if (this.isAccountDeleting(accountId)) return;

    const targetMsgId = reaction.key.id;
    const emoji = reaction.reaction?.text || '';
    const senderJid = reaction.reaction?.key?.participant || reaction.key.remoteJid;
    const senderId = senderJid ? extractUserIdFromJid(senderJid) : 'unknown';
    const timestamp = Date.now();

    console.log(`[WA] Reaction: ${emoji} on message ${targetMsgId} from ${senderId}`);

    const message = await queryOne<{ id: string; reactions: any[] }>(
      `SELECT id, reactions FROM messages WHERE wa_message_id = $1`,
      [targetMsgId]
    );

    if (!message) {
      console.log(`[WA] Message not found for reaction: ${targetMsgId}`);
      return;
    }

    let reactions = message.reactions || [];

    if (emoji === '') {
      reactions = reactions.filter((r: any) => r.sender !== senderId);
    } else {
      reactions = reactions.filter((r: any) => r.sender !== senderId);
      reactions.push({ emoji, sender: senderId, timestamp });
    }

    await execute(
      `UPDATE messages SET reactions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(reactions), message.id]
    );

    // Emit to account room so ALL agents see reaction updates
    const io = getIO();
    io.to(`account:${accountId}`).emit('message:reaction', {
      accountId,
      messageId: message.id,
      waMessageId: targetMsgId,
      reactions,
    });

    console.log(`[WA] Updated reactions on message ${message.id}: ${reactions.length} total`);
  }

  /**
   * Handle group upsert (new groups discovered)
   */
  private async handleGroupUpsert(accountId: string, userId: string, metadata: any): Promise<void> {
    if (this.isAccountDeleting(accountId)) return;

    const groupJid = metadata.id;
    if (!groupJid || !isJidGroup(groupJid)) return;

    console.log(`[WA][Group] New group discovered: ${metadata.subject} (${extractGroupId(groupJid)})`);

    const group = await queryOne(
      `INSERT INTO groups (whatsapp_account_id, group_jid, name, description, owner_jid, participant_count, is_announce, is_restrict)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (whatsapp_account_id, group_jid) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, groups.name),
         description = COALESCE(EXCLUDED.description, groups.description),
         owner_jid = COALESCE(EXCLUDED.owner_jid, groups.owner_jid),
         participant_count = COALESCE(EXCLUDED.participant_count, groups.participant_count),
         is_announce = COALESCE(EXCLUDED.is_announce, groups.is_announce),
         is_restrict = COALESCE(EXCLUDED.is_restrict, groups.is_restrict),
         updated_at = NOW()
       RETURNING *`,
      [
        accountId,
        groupJid,
        metadata.subject || null,
        metadata.desc || null,
        metadata.owner || null,
        metadata.participants?.length || 0,
        metadata.announce || false,
        metadata.restrict || false,
      ]
    );

    if (metadata.participants && metadata.participants.length > 0) {
      for (const participant of metadata.participants) {
        const pJid = typeof participant === 'string' ? participant : participant.id;
        const isAdmin = typeof participant === 'object' && (participant.admin === 'admin' || participant.admin === 'superadmin');
        const isSuperAdmin = typeof participant === 'object' && participant.admin === 'superadmin';

        await execute(
          `INSERT INTO group_participants (group_id, participant_jid, is_admin, is_superadmin)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (group_id, participant_jid) DO UPDATE SET
             is_admin = EXCLUDED.is_admin,
             is_superadmin = EXCLUDED.is_superadmin,
             updated_at = NOW()`,
          [group.id, pJid, isAdmin, isSuperAdmin]
        );
      }
    }

    await queryOne(
      `INSERT INTO conversations (whatsapp_account_id, group_id, is_group, last_message_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (whatsapp_account_id, group_id) WHERE group_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [accountId, group.id]
    );

    groupMetadataCache.set(accountId, groupJid, metadata as any);
    console.log(`[WA][Group] Upserted group ${metadata.subject} with ${metadata.participants?.length || 0} participants`);
  }

  /**
   * Handle group metadata updates
   */
  private async handleGroupUpdate(accountId: string, userId: string, update: any): Promise<void> {
    const groupJid = update.id;
    if (!groupJid) return;

    console.log(`[WA][Group] Metadata update for ${extractGroupId(groupJid)}:`, {
      subject: update.subject,
      desc: update.desc?.slice(0, 50),
    });

    await execute(
      `UPDATE groups
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_announce = COALESCE($3, is_announce),
           is_restrict = COALESCE($4, is_restrict),
           updated_at = NOW()
       WHERE whatsapp_account_id = $5 AND group_jid = $6`,
      [
        update.subject || null,
        update.desc || null,
        update.announce !== undefined ? update.announce : null,
        update.restrict !== undefined ? update.restrict : null,
        accountId,
        groupJid,
      ]
    );

    groupMetadataCache.handleGroupUpdate(accountId, groupJid, {
      subject: update.subject,
      desc: update.desc,
      announce: update.announce,
      restrict: update.restrict,
    });

    // Emit to account room so ALL agents see group updates
    const io = getIO();
    io.to(`account:${accountId}`).emit('group:update', {
      accountId,
      groupJid,
      updates: {
        name: update.subject,
        description: update.desc,
        isAnnounce: update.announce,
        isRestrict: update.restrict,
      },
    });
  }

  /**
   * Handle group participant updates (join, leave, promote, demote)
   */
  private async handleGroupParticipantsUpdate(accountId: string, userId: string, update: any): Promise<void> {
    console.log(`[WA] group-participants.update:`, {
      groupJid: update.id,
      action: update.action,
      participants: update.participants?.length,
    });

    const groupJid = update.id;
    const action = update.action;

    const rawParticipants = update.participants || [];
    const participants: string[] = rawParticipants.map((p: any) =>
      typeof p === 'string' ? p : (p.id || p.jid || String(p))
    );

    if (action !== 'add' && action !== 'remove' && action !== 'promote' && action !== 'demote') {
      console.log(`[WA][Group] Skipping action: ${action}`);
      return;
    }

    const delay = getAccountSpecificDelay(accountId, 100, 1000);
    await sleep(delay);

    const group = await queryOne(
      'SELECT id FROM groups WHERE whatsapp_account_id = $1 AND group_jid = $2',
      [accountId, groupJid]
    );

    if (!group) {
      console.log(`[WA][Group] Group not found in DB for participant update: ${groupJid}`);
      return;
    }

    for (const participantJid of participants) {
      switch (action) {
        case 'add':
          await queryOne(
            `INSERT INTO group_participants (group_id, participant_jid, is_admin, is_superadmin)
             VALUES ($1, $2, FALSE, FALSE)
             ON CONFLICT (group_id, participant_jid) DO NOTHING
             RETURNING *`,
            [group.id, participantJid]
          );
          break;
        case 'remove':
          await execute(
            `DELETE FROM group_participants WHERE group_id = $1 AND participant_jid = $2`,
            [group.id, participantJid]
          );
          break;
        case 'promote':
          await execute(
            `UPDATE group_participants SET is_admin = TRUE, updated_at = NOW()
             WHERE group_id = $1 AND participant_jid = $2`,
            [group.id, participantJid]
          );
          break;
        case 'demote':
          await execute(
            `UPDATE group_participants SET is_admin = FALSE, updated_at = NOW()
             WHERE group_id = $1 AND participant_jid = $2`,
            [group.id, participantJid]
          );
          break;
      }
    }

    const countResult = await queryOne(
      `SELECT COUNT(*) as count FROM group_participants WHERE group_id = $1`,
      [group.id]
    );
    await execute(
      `UPDATE groups SET participant_count = $1, updated_at = NOW() WHERE id = $2`,
      [countResult?.count || 0, group.id]
    );

    groupMetadataCache.handleParticipantUpdate(accountId, groupJid, participants, action);
    console.log(`[WA][Group] Processed ${action} for ${participants.length} participants in ${extractGroupId(groupJid)}`);

    // Emit to account room so ALL agents see participant updates
    const io = getIO();
    io.to(`account:${accountId}`).emit('group:participants', {
      accountId,
      groupJid,
      action,
      participants,
    });
  }

  /**
   * Handle LID-to-PN mapping updates
   */
  private async handleLidMapping(accountId: string, mappings: Record<string, any>): Promise<void> {
    console.log(`[WA] lid-mapping.update - mappings received:`, Object.keys(mappings).length);

    for (const [lid, pn] of Object.entries(mappings)) {
      try {
        const lidClean = lid.replace('@lid', '');
        const pnClean = typeof pn === 'string' ? pn.replace('@s.whatsapp.net', '') : pn;

        await execute(
          `INSERT INTO lid_pn_mappings (whatsapp_account_id, lid, pn)
           VALUES ($1, $2, $3)
           ON CONFLICT (whatsapp_account_id, lid) DO UPDATE SET pn = $3, updated_at = NOW()`,
          [accountId, lidClean, pnClean]
        );

        const lidContact = await queryOne(
          `SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2`,
          [accountId, lidClean]
        );
        const pnContact = await queryOne(
          `SELECT * FROM contacts WHERE whatsapp_account_id = $1 AND wa_id = $2`,
          [accountId, pnClean]
        );

        if (lidContact && pnContact && lidContact.id !== pnContact.id) {
          console.log(`[WA] Merging duplicate contacts: LID ${lidClean} -> PN ${pnClean}`);

          await execute(
            `UPDATE conversations SET contact_id = $1, updated_at = NOW() WHERE contact_id = $2`,
            [pnContact.id, lidContact.id]
          );

          await execute(
            `UPDATE contact_orders SET contact_id = $1, updated_at = NOW() WHERE contact_id = $2`,
            [pnContact.id, lidContact.id]
          );

          await execute(`DELETE FROM contacts WHERE id = $1`, [lidContact.id]);
          console.log(`[WA] Merged contact ${lidContact.id} (LID) into ${pnContact.id} (PN)`);
        } else if (lidContact && !pnContact) {
          await execute(
            `UPDATE contacts SET phone_number = $1, updated_at = NOW() WHERE id = $2`,
            [pnClean, lidContact.id]
          );
          console.log(`[WA] Updated LID contact ${lidContact.id} with phone: ${pnClean}`);
        }

        console.log(`[WA] Stored LID->PN mapping: ${lidClean} -> ${pnClean}`);
      } catch (error) {
        console.error(`[WA] Error processing LID mapping:`, error);
      }
    }
  }

  /**
   * Mark messages as read (sends read receipt)
   * Helps maintain a natural conversation appearance
   * Respects incognito mode - won't send read receipts if enabled
   */
  async markAsRead(accountId: string, keys: WAMessageKey[]): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session?.isReady) return;

    // INCOGNITO MODE: Don't send read receipts (blue ticks) when enabled
    if (session.incognitoMode) {
      console.log(`[WA] Incognito mode enabled - skipping read receipts for ${keys.length} messages`);
      return;
    }

    try {
      await session.socket.readMessages(keys);
      console.log(`[WA] Marked ${keys.length} messages as read`);
    } catch (error) {
      console.error(`[WA] Failed to mark messages as read:`, error);
    }
  }

  /**
   * Update incognito mode for an active session
   * Called when user toggles incognito mode from frontend
   */
  updateIncognitoMode(accountId: string, incognitoMode: boolean): void {
    const session = this.sessions.get(accountId);
    if (session) {
      session.incognitoMode = incognitoMode;
      console.log(`[WA] Updated incognito mode for account ${accountId}: ${incognitoMode}`);
    }
  }

  /**
   * Send presence update (online, offline, typing)
   */
  async sendPresence(
    accountId: string,
    jid: string,
    presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session?.isReady) return;

    try {
      await session.socket.sendPresenceUpdate(presence, jid);
    } catch (error) {
      console.error(`[WA] Failed to send presence:`, error);
    }
  }

  /**
   * Get group metadata from WhatsApp
   */
  async getGroupMetadata(accountId: string, groupJid: string) {
    const session = this.sessions.get(accountId);
    if (!session?.socket) {
      throw new Error('Session not found or not connected');
    }
    return session.socket.groupMetadata(groupJid);
  }

  /**
   * Get anti-ban statistics for an account
   */
  async getAntiBanStats(accountId: string) {
    return getAntiBanStats(accountId);
  }

  /**
   * Check if account is in warm-up period (higher risk)
   */
  async isInWarmupPeriod(accountId: string): Promise<boolean> {
    return isInWarmupPeriod(accountId);
  }

  /**
   * Send a reaction to a message
   * @param accountId - WhatsApp account ID
   * @param remoteJid - The JID of the conversation (contact or group)
   * @param messageKey - The key of the message to react to
   * @param emoji - The emoji to react with (empty string to remove reaction)
   */
  async sendReaction(
    accountId: string,
    remoteJid: string,
    messageKey: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
    emoji: string
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sock = session.socket;

    // Check if socket is connected
    if (!sock.user) {
      throw new Error('Session not connected - please reconnect');
    }

    console.log(`[WA] Sending reaction ${emoji || '(remove)'} to message ${messageKey.id}`);

    // === ANTI-BAN: Small delay before reaction (500-1000ms) ===
    const reactionDelay = 500 + Math.floor(Math.random() * 500);
    await sleep(reactionDelay);

    try {
      await sock.sendMessage(remoteJid, {
        react: {
          text: emoji,
          key: messageKey,
        },
      });
      console.log(`[WA] Reaction sent successfully`);
    } catch (error) {
      console.error(`[WA] Failed to send reaction:`, error);
      throw error;
    }
  }

  /**
   * Forward a message to another chat
   * @param accountId - WhatsApp account ID
   * @param targetJid - The JID to forward to (contact or group)
   * @param messageKey - The key of the message to forward
   * @param rawMessageFallback - Optional raw message JSON from DB for fallback
   */
  async forwardMessage(
    accountId: string,
    targetJid: string,
    messageKey: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
    rawMessageFallback?: any
  ): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.waitForReady(accountId, 30000);

    const sock = session.socket;
    if (!sock.user) {
      throw new Error('Session not connected - please reconnect');
    }

    console.log(`[WA] Forwarding message ${messageKey.id} to ${targetJid}`);

    // Try to get the original message content from MessageStore (cache first, then DB)
    let originalMsgContent = await messageStore.getMessage(accountId, messageKey as WAMessageKey);

    // Fallback: try parsing raw_message from DB if provided
    if (!originalMsgContent && rawMessageFallback) {
      try {
        const parsed = typeof rawMessageFallback === 'string'
          ? JSON.parse(rawMessageFallback)
          : rawMessageFallback;
        if (parsed && typeof parsed === 'object') {
          originalMsgContent = parsed;
          console.log(`[WA] Using raw_message fallback for forward`);
        }
      } catch (e) {
        console.warn(`[WA] Failed to parse raw_message fallback:`, e);
      }
    }

    if (!originalMsgContent) {
      throw new Error('Original message not found - cannot forward. Message may be too old or not cached.');
    }

    // Build full WAMessage object for forwarding
    // Baileys expects { forward: WAMessage } where WAMessage has key + message
    const waMessage = {
      key: messageKey,
      message: originalMsgContent,
    };

    // === ANTI-BAN MEASURES FOR FORWARDING ===
    // Forwards are more suspicious than regular messages, use longer delays

    // 1. Anti-ban pre-check (rate limiting, daily limits)
    const isGroup = targetJid.endsWith('@g.us');
    if (isGroup) {
      const check = await preSendCheckGroup(accountId);
      if (!check.canSend) {
        throw new Error(`Forward blocked: ${check.reason}`);
      }
    } else {
      const waId = targetJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
      const check = await preSendCheck(accountId, waId);
      if (!check.canSend) {
        throw new Error(`Forward blocked: ${check.reason}`);
      }
    }

    // 2. Typing indicator (makes forwarding look like regular typing)
    try {
      await sock.sendPresenceUpdate('composing', targetJid);
    } catch (e) {
      // Typing indicator is optional
    }

    // 3. Longer delay for forwards (800-2000ms - more suspicious action)
    const forwardDelay = 800 + Math.floor(Math.random() * 1200);
    await sleep(forwardDelay);

    // 4. Stop typing
    try {
      await sock.sendPresenceUpdate('paused', targetJid);
    } catch (e) {
      // Optional
    }

    try {
      // Use Baileys forward functionality
      // Pass the full WAMessage object (key + message)
      const result = await sock.sendMessage(targetJid, {
        forward: waMessage,
      });

      if (!result?.key?.id) {
        throw new Error('Forward sent but no ID returned');
      }

      // 5. Post-send recording for rate limiting
      if (isGroup) {
        postSendRecordGroup(accountId);
      } else {
        const waId = targetJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
        await postSendRecord(accountId, waId);
      }

      console.log(`[WA] Message forwarded successfully: ${result.key.id}`);
      return result.key.id;
    } catch (error) {
      console.error(`[WA] Failed to forward message:`, error);
      throw error;
    }
  }

  async reconnectSession(accountId: string, userId: string): Promise<void> {
    console.log(`[WA] Reconnecting session ${accountId}`);
    await this.destroySession(accountId);
    await this.createSession(accountId, userId);
  }

  async destroySession(accountId: string): Promise<void> {
    // Mark account as being deleted FIRST to prevent async handlers from processing
    this.deletingAccounts.add(accountId);
    console.log(`[WA] Marked account ${accountId} as deleting`);

    const session = this.sessions.get(accountId);
    if (session) {
      console.log(`[WA] Destroying session ${accountId}`);
      try {
        session.socket.end(undefined);
      } catch (error) {
        console.error(`[WA] Error ending socket:`, error);
      }
      this.sessions.delete(accountId);

      // Cleanup caches and monitoring for this account
      messageStore.clearAccount(accountId);
      groupMetadataCache.cleanup(accountId);
      messageQueue.cleanup(accountId);
      messageDeduplicator.clearAccount(accountId);
      healthMonitor.stopMonitoring(accountId);
      reconnectManager.clearState(accountId);
    }

    // Keep in deletingAccounts set for a while to catch any straggling async handlers
    setTimeout(() => {
      this.deletingAccounts.delete(accountId);
      console.log(`[WA] Removed account ${accountId} from deleting set`);
    }, 10000); // 10 seconds should be enough for any pending operations
  }

  isAccountDeleting(accountId: string): boolean {
    return this.deletingAccounts.has(accountId);
  }

  private async cleanupSession(accountId: string): Promise<void> {
    console.log(`[WA] Cleaning up session data for ${accountId}`);
    // Clear PostgreSQL auth state on logout
    await clearPostgresAuthState(accountId);
    // Clear reconnect manager state
    reconnectManager.clearState(accountId);
  }

  async restoreAllSessions(): Promise<void> {
    try {
      // Wait 3 seconds before restoring sessions (let database connections stabilize)
      console.log('[WA] Waiting 3s before restoring sessions...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Restore ALL accounts that have session data (not just 'connected' ones)
      // This handles cases where server restarted while accounts were temporarily disconnected
      const accounts = await query<{ id: string; user_id: string; status: string }>(
        "SELECT id, user_id, status FROM whatsapp_accounts WHERE session_data IS NOT NULL"
      );

      console.log(`[WA] Found ${accounts.length} WhatsApp accounts with session data to restore...`);

      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        try {
          console.log(`[WA] Restoring session ${i + 1}/${accounts.length} for account ${account.id} (was: ${account.status})`);
          await this.createSession(account.id, account.user_id);

          // Add 2 second delay between session restorations to avoid rapid connections
          if (i < accounts.length - 1) {
            console.log('[WA] Waiting 2s before next session...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error(`[WA] Failed to restore session ${account.id}:`, error);
          // Mark as disconnected if restoration fails
          await execute(
            "UPDATE whatsapp_accounts SET status = 'disconnected' WHERE id = $1",
            [account.id]
          );
        }
      }

      console.log('[WA] Session restoration complete');
    } catch (error) {
      console.error('[WA] Failed to restore sessions:', error);
    }
  }

  getSession(accountId: string): WASocket | undefined {
    const session = this.sessions.get(accountId);
    return session?.socket;
  }

  isSessionReady(accountId: string): boolean {
    const session = this.sessions.get(accountId);
    return session?.isReady || false;
  }
}

export const sessionManager = new SessionManager();
