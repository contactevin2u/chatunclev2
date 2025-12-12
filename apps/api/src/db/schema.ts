import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  real,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================
// USERS & AUTHENTICATION
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
}));

// ============================================
// ACCOUNTS (Channel connections)
// ============================================

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelType: varchar('channel_type', { length: 50 }).notNull(), // whatsapp, telegram, tiktok, instagram, messenger
  channelIdentifier: varchar('channel_identifier', { length: 255 }), // Phone number, bot username, etc.
  phoneNumber: varchar('phone_number', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('disconnected'),
  credentials: jsonb('credentials'), // Encrypted credentials
  settings: jsonb('settings'),
  incognitoMode: boolean('incognito_mode').notNull().default(false),
  lastConnectedAt: timestamp('last_connected_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_accounts_user_id').on(table.userId),
  channelTypeIdx: index('idx_accounts_channel_type').on(table.channelType),
  statusIdx: index('idx_accounts_status').on(table.status),
}));

// ============================================
// ACCOUNT ACCESS (Multi-agent support)
// ============================================

export const accountAccess = pgTable('account_access', {
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('agent'), // owner, admin, agent
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.accountId, table.agentId] }),
  agentIdIdx: index('idx_account_access_agent_id').on(table.agentId),
}));

// ============================================
// CONTACTS
// ============================================

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  channelType: varchar('channel_type', { length: 50 }).notNull(),
  channelContactId: varchar('channel_contact_id', { length: 255 }).notNull(), // Unified channel contact ID
  name: varchar('name', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 50 }),
  profilePicUrl: text('profile_pic_url'),
  jidType: varchar('jid_type', { length: 50 }), // user, group, broadcast, newsletter
  // Channel-specific IDs
  waId: varchar('wa_id', { length: 100 }),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
  telegramUsername: varchar('telegram_username', { length: 100 }),
  tiktokUserId: varchar('tiktok_user_id', { length: 100 }),
  instagramUserId: varchar('instagram_user_id', { length: 100 }),
  messengerUserId: varchar('messenger_user_id', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_contacts_account_id').on(table.accountId),
  channelContactIdx: uniqueIndex('idx_contacts_account_channel').on(table.accountId, table.channelContactId),
  waIdIdx: index('idx_contacts_wa_id').on(table.waId),
  telegramIdx: index('idx_contacts_telegram').on(table.telegramUserId),
  tiktokIdx: index('idx_contacts_tiktok').on(table.tiktokUserId),
  instagramIdx: index('idx_contacts_instagram').on(table.instagramUserId),
  messengerIdx: index('idx_contacts_messenger').on(table.messengerUserId),
}));

// ============================================
// GROUPS
// ============================================

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  groupJid: varchar('group_jid', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ownerJid: varchar('owner_jid', { length: 255 }),
  participantCount: integer('participant_count').notNull().default(0),
  profilePicUrl: text('profile_pic_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_groups_account_id').on(table.accountId),
  groupJidIdx: uniqueIndex('idx_groups_account_jid').on(table.accountId, table.groupJid),
}));

// ============================================
// CONVERSATIONS
// ============================================

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  channelType: varchar('channel_type', { length: 50 }).notNull(),
  isGroup: boolean('is_group').notNull().default(false),
  lastMessageAt: timestamp('last_message_at'),
  unreadCount: integer('unread_count').notNull().default(0),
  firstResponseAt: timestamp('first_response_at'),
  assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  // Channel-specific IDs
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
  tiktokConversationId: varchar('tiktok_conversation_id', { length: 255 }),
  instagramConversationId: varchar('instagram_conversation_id', { length: 255 }),
  messengerConversationId: varchar('messenger_conversation_id', { length: 255 }),
  // Twilio-like conversation state management
  state: varchar('state', { length: 50 }).notNull().default('active'),           // active, inactive, closed
  stateChangedAt: timestamp('state_changed_at').defaultNow(),
  closedAt: timestamp('closed_at'),
  closedReason: varchar('closed_reason', { length: 100 }),
  customInactivityTimeoutMs: integer('custom_inactivity_timeout_ms'),             // Per-conversation override
  customCloseTimeoutMs: integer('custom_close_timeout_ms'),                       // Per-conversation override
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_conversations_account_id').on(table.accountId),
  contactIdIdx: index('idx_conversations_contact_id').on(table.contactId),
  groupIdIdx: index('idx_conversations_group_id').on(table.groupId),
  lastMessageAtIdx: index('idx_conversations_last_message').on(table.lastMessageAt),
  assignedAgentIdx: index('idx_conversations_assigned_agent').on(table.assignedAgentId),
  stateIdx: index('idx_conversations_state').on(table.state),
}));

// ============================================
// MESSAGES
// ============================================

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  channelMessageId: varchar('channel_message_id', { length: 255 }).notNull(), // wa_message_id, telegram_message_id, etc.
  channelType: varchar('channel_type', { length: 50 }).notNull(),
  senderType: varchar('sender_type', { length: 50 }).notNull(), // agent, contact, system
  contentType: varchar('content_type', { length: 50 }).notNull(), // text, image, video, audio, document, sticker, location
  content: text('content'),
  mediaUrl: text('media_url'),
  mediaMimeType: varchar('media_mime_type', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, queued, sent, delivered, read, failed
  agentId: uuid('agent_id').references(() => users.id, { onDelete: 'set null' }),
  isAutoReply: boolean('is_auto_reply').notNull().default(false),
  responseTimeMs: integer('response_time_ms'),
  senderJid: varchar('sender_jid', { length: 255 }),
  senderName: varchar('sender_name', { length: 255 }),
  reactions: jsonb('reactions').$type<Array<{ emoji: string; senderJid: string; senderName?: string; timestamp: string }>>(),
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  quotedMessageId: uuid('quoted_message_id'),
  quotedChannelMessageId: varchar('quoted_channel_message_id', { length: 255 }),
  quotedContent: text('quoted_content'),
  quotedSenderName: varchar('quoted_sender_name', { length: 255 }),
  rawMessage: jsonb('raw_message'),
  retryCount: integer('retry_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at'),
  // Twilio-like features
  errorCode: integer('error_code'),                                           // Standardized error code (30xxx)
  errorMessage: text('error_message'),                                        // Human-readable error
  validityPeriodSeconds: integer('validity_period_seconds').default(14400),   // Message validity (default 4h)
  expiresAt: timestamp('expires_at'),                                         // Calculated expiration time
  idempotencyKey: varchar('idempotency_key', { length: 64 }),                 // Request deduplication key
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
  channelMessageIdIdx: uniqueIndex('idx_messages_channel_message_id').on(table.channelMessageId),
  createdAtIdx: index('idx_messages_created_at').on(table.createdAt),
  statusIdx: index('idx_messages_status').on(table.status),
  senderTypeIdx: index('idx_messages_sender_type').on(table.senderType),
  expiresAtIdx: index('idx_messages_expires_at').on(table.expiresAt),
  idempotencyKeyIdx: index('idx_messages_idempotency_key').on(table.idempotencyKey),
}));

// ============================================
// LID/PN MAPPINGS (WhatsApp v7 deduplication)
// ============================================

export const lidPnMappings = pgTable('lid_pn_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  lid: varchar('lid', { length: 255 }).notNull(),
  pn: varchar('pn', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  accountLidIdx: uniqueIndex('idx_lid_pn_account_lid').on(table.accountId, table.lid),
  accountPnIdx: index('idx_lid_pn_account_pn').on(table.accountId, table.pn),
}));

// ============================================
// TEMPLATES
// ============================================

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  content: text('content').notNull(),
  category: varchar('category', { length: 100 }),
  variables: jsonb('variables').$type<string[]>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_templates_user_id').on(table.userId),
  categoryIdx: index('idx_templates_category').on(table.category),
}));

// ============================================
// SEQUENCES (Automated message flows)
// ============================================

export const sequences = pgTable('sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  steps: jsonb('steps').$type<Array<{
    order: number;
    delayMinutes: number;
    contentType: string;
    content: string;
    mediaUrl?: string;
  }>>().notNull(),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // keyword, new_contact, manual
  triggerKeyword: varchar('trigger_keyword', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_sequences_user_id').on(table.userId),
  isActiveIdx: index('idx_sequences_is_active').on(table.isActive),
}));

// ============================================
// SCHEDULED MESSAGES
// ============================================

export const scheduledMessages = pgTable('scheduled_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  content: text('content'),
  contentType: varchar('content_type', { length: 50 }).notNull().default('text'),
  mediaUrl: text('media_url'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, sent, failed, cancelled
  sentAt: timestamp('sent_at'),
  error: text('error'),
  // Twilio-like features
  idempotencyKey: varchar('idempotency_key', { length: 64 }),             // Request deduplication
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_scheduled_messages_account_id').on(table.accountId),
  scheduledAtIdx: index('idx_scheduled_messages_scheduled_at').on(table.scheduledAt),
  statusIdx: index('idx_scheduled_messages_status').on(table.status),
  idempotencyKeyIdx: index('idx_scheduled_messages_idempotency').on(table.idempotencyKey),
}));

// ============================================
// AUTO-REPLY RULES
// ============================================

export const autoReplyRules = pgTable('auto_reply_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  triggerKeyword: varchar('trigger_keyword', { length: 255 }).notNull(),
  responseContent: text('response_content').notNull(),
  matchType: varchar('match_type', { length: 50 }).notNull().default('contains'), // exact, contains, starts_with, regex
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_auto_reply_rules_account_id').on(table.accountId),
  isActiveIdx: index('idx_auto_reply_rules_is_active').on(table.isActive),
}));

// ============================================
// KNOWLEDGE BANK (AI Context)
// ============================================

export const knowledgeEntries = pgTable('knowledge_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  category: varchar('category', { length: 100 }),
  embedding: real('embedding').array(), // Vector embedding for similarity search
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_knowledge_entries_user_id').on(table.userId),
  categoryIdx: index('idx_knowledge_entries_category').on(table.category),
}));

// ============================================
// NOTES (Contact context panel)
// ============================================

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  contactIdIdx: index('idx_notes_contact_id').on(table.contactId),
  agentIdIdx: index('idx_notes_agent_id').on(table.agentId),
}));

// ============================================
// LABELS
// ============================================

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 50 }).notNull().default('#3B82F6'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: index('idx_labels_account_id').on(table.accountId),
  uniqueNameIdx: uniqueIndex('idx_labels_account_name').on(table.accountId, table.name),
}));

export const contactLabels = pgTable('contact_labels', {
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  labelId: uuid('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.contactId, table.labelId] }),
}));

// ============================================
// WHATSAPP AUTH STATE (Baileys)
// ============================================

export const whatsappAuthState = pgTable('whatsapp_auth_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  dataType: varchar('data_type', { length: 100 }).notNull(), // creds, keys, etc.
  dataKey: varchar('data_key', { length: 255 }).notNull(),
  dataValue: text('data_value').notNull(), // JSON stringified
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountTypeKeyIdx: uniqueIndex('idx_wa_auth_account_type_key').on(table.accountId, table.dataType, table.dataKey),
}));

// ============================================
// WEBHOOK CONFIGURATIONS (Twilio-like)
// ============================================

export const webhookConfigs = pgTable('webhook_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 2048 }).notNull(),
  secret: varchar('secret', { length: 64 }).notNull(),              // HMAC signing secret
  events: jsonb('events').$type<string[]>().notNull(),               // Array of event types to send
  isActive: boolean('is_active').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lastFailedAt: timestamp('last_failed_at'),
  lastSucceededAt: timestamp('last_succeeded_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: uniqueIndex('idx_webhook_configs_account_id').on(table.accountId),
  isActiveIdx: index('idx_webhook_configs_is_active').on(table.isActive),
}));

// ============================================
// WEBHOOK DELIVERIES (Twilio-like)
// ============================================

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhookConfigs.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, delivering, delivered, failed, exhausted
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  nextRetryAt: timestamp('next_retry_at'),
  lastAttemptAt: timestamp('last_attempt_at'),
  lastError: text('last_error'),
  lastResponseStatus: integer('last_response_status'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at'),
}, (table) => ({
  webhookIdIdx: index('idx_webhook_deliveries_webhook_id').on(table.webhookId),
  statusIdx: index('idx_webhook_deliveries_status').on(table.status),
  nextRetryAtIdx: index('idx_webhook_deliveries_next_retry').on(table.nextRetryAt),
}));

// ============================================
// IDEMPOTENCY KEYS (Twilio-like)
// ============================================

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(),     // SHA256 of request params
  response: jsonb('response').notNull(),                               // Cached response
  expiresAt: timestamp('expires_at').notNull(),                        // 24h TTL
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  accountKeyIdx: uniqueIndex('idx_idempotency_account_key').on(table.accountId, table.idempotencyKey),
  expiresAtIdx: index('idx_idempotency_expires_at').on(table.expiresAt),
}));

// ============================================
// API REQUEST LOGS (Twilio-like)
// ============================================

export const apiRequestLogs = pgTable('api_request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: varchar('request_id', { length: 64 }).notNull().unique(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  method: varchar('method', { length: 10 }).notNull(),
  path: varchar('path', { length: 2048 }).notNull(),
  query: jsonb('query'),
  requestHeaders: jsonb('request_headers'),
  requestBody: jsonb('request_body'),                                   // Only in debug mode
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body'),                                 // Only in debug mode
  durationMs: integer('duration_ms').notNull(),
  ip: varchar('ip', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  requestIdIdx: index('idx_api_logs_request_id').on(table.requestId),
  accountIdIdx: index('idx_api_logs_account_id').on(table.accountId),
  createdAtIdx: index('idx_api_logs_created_at').on(table.createdAt),
}));

// ============================================
// ACCOUNT TIERS (Rate limiting)
// ============================================

export const accountTiers = pgTable('account_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tier: varchar('tier', { length: 50 }).notNull().default('free'),     // free, starter, business, enterprise
  maxRequestsPerMinute: integer('max_requests_per_minute').notNull().default(100),
  maxMessagesPerDay: integer('max_messages_per_day'),
  features: jsonb('features').$type<string[]>(),                        // Feature flags
  validUntil: timestamp('valid_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountIdIdx: uniqueIndex('idx_account_tiers_account_id').on(table.accountId),
  tierIdx: index('idx_account_tiers_tier').on(table.tier),
}));

// ============================================
// CONVERSATION TIMERS (Twilio-like)
// ============================================

export const conversationTimers = pgTable('conversation_timers', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  timerType: varchar('timer_type', { length: 50 }).notNull(),          // inactivity, close
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, fired, cancelled, reset
  expiresAt: timestamp('expires_at').notNull(),
  firedAt: timestamp('fired_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  conversationIdIdx: index('idx_conv_timers_conversation_id').on(table.conversationId),
  statusIdx: index('idx_conv_timers_status').on(table.status),
  expiresAtIdx: index('idx_conv_timers_expires_at').on(table.expiresAt),
  activeTimerIdx: uniqueIndex('idx_conv_timers_active').on(table.conversationId, table.timerType).where(sql`${table.status} = 'active'`),
}));

// ============================================
// CONVERSATION STATE HISTORY (Twilio-like)
// ============================================

export const conversationStateHistory = pgTable('conversation_state_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  previousState: varchar('previous_state', { length: 50 }).notNull(),
  newState: varchar('new_state', { length: 50 }).notNull(),
  reason: varchar('reason', { length: 100 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 50 }).notNull(),      // system, agent, timer
  agentId: uuid('agent_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  conversationIdIdx: index('idx_conv_state_history_conversation').on(table.conversationId),
  createdAtIdx: index('idx_conv_state_history_created_at').on(table.createdAt),
}));

// ============================================
// RELATIONS
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  accountAccess: many(accountAccess),
  templates: many(templates),
  sequences: many(sequences),
  knowledgeEntries: many(knowledgeEntries),
  notes: many(notes),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  accountAccess: many(accountAccess),
  contacts: many(contacts),
  groups: many(groups),
  conversations: many(conversations),
  scheduledMessages: many(scheduledMessages),
  autoReplyRules: many(autoReplyRules),
  labels: many(labels),
  lidPnMappings: many(lidPnMappings),
  whatsappAuthState: many(whatsappAuthState),
  // Twilio-like relations
  webhookConfig: one(webhookConfigs),
  accountTier: one(accountTiers),
  idempotencyKeys: many(idempotencyKeys),
  apiRequestLogs: many(apiRequestLogs),
}));

export const accountAccessRelations = relations(accountAccess, ({ one }) => ({
  account: one(accounts, {
    fields: [accountAccess.accountId],
    references: [accounts.id],
  }),
  agent: one(users, {
    fields: [accountAccess.agentId],
    references: [users.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [contacts.accountId],
    references: [accounts.id],
  }),
  conversations: many(conversations),
  notes: many(notes),
  labels: many(contactLabels),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  account: one(accounts, {
    fields: [groups.accountId],
    references: [accounts.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  account: one(accounts, {
    fields: [conversations.accountId],
    references: [accounts.id],
  }),
  contact: one(contacts, {
    fields: [conversations.contactId],
    references: [contacts.id],
  }),
  group: one(groups, {
    fields: [conversations.groupId],
    references: [groups.id],
  }),
  assignedAgent: one(users, {
    fields: [conversations.assignedAgentId],
    references: [users.id],
  }),
  messages: many(messages),
  scheduledMessages: many(scheduledMessages),
  // Twilio-like relations
  timers: many(conversationTimers),
  stateHistory: many(conversationStateHistory),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  agent: one(users, {
    fields: [messages.agentId],
    references: [users.id],
  }),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  account: one(accounts, {
    fields: [labels.accountId],
    references: [accounts.id],
  }),
  contacts: many(contactLabels),
}));

export const contactLabelsRelations = relations(contactLabels, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactLabels.contactId],
    references: [contacts.id],
  }),
  label: one(labels, {
    fields: [contactLabels.labelId],
    references: [labels.id],
  }),
}));

// ============================================
// TWILIO-LIKE TABLE RELATIONS
// ============================================

export const webhookConfigsRelations = relations(webhookConfigs, ({ one, many }) => ({
  account: one(accounts, {
    fields: [webhookConfigs.accountId],
    references: [accounts.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhookConfigs, {
    fields: [webhookDeliveries.webhookId],
    references: [webhookConfigs.id],
  }),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  account: one(accounts, {
    fields: [idempotencyKeys.accountId],
    references: [accounts.id],
  }),
}));

export const apiRequestLogsRelations = relations(apiRequestLogs, ({ one }) => ({
  account: one(accounts, {
    fields: [apiRequestLogs.accountId],
    references: [accounts.id],
  }),
  user: one(users, {
    fields: [apiRequestLogs.userId],
    references: [users.id],
  }),
}));

export const accountTiersRelations = relations(accountTiers, ({ one }) => ({
  account: one(accounts, {
    fields: [accountTiers.accountId],
    references: [accounts.id],
  }),
}));

export const conversationTimersRelations = relations(conversationTimers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTimers.conversationId],
    references: [conversations.id],
  }),
  cancelledByUser: one(users, {
    fields: [conversationTimers.cancelledBy],
    references: [users.id],
  }),
}));

export const conversationStateHistoryRelations = relations(conversationStateHistory, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationStateHistory.conversationId],
    references: [conversations.id],
  }),
  agent: one(users, {
    fields: [conversationStateHistory.agentId],
    references: [users.id],
  }),
}));
