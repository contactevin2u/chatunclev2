import type { ChannelType, AccountRole } from './index.js';

// ============================================
// CONVERSATION STATES
// ============================================

export type ConversationState = 'active' | 'inactive' | 'closed';

export interface ConversationStateChange {
  id: string;
  conversationId: string;
  previousState: ConversationState;
  newState: ConversationState;
  reason: string;
  triggeredBy: 'system' | 'agent' | 'timer';
  agentId?: string;
  createdAt: Date;
}

// ============================================
// CONVERSATION TIMERS
// ============================================

export type ConversationTimerType = 'inactivity' | 'close';

export type ConversationTimerStatus = 'active' | 'fired' | 'cancelled' | 'reset';

export interface ConversationTimer {
  id: string;
  conversationId: string;
  timerType: ConversationTimerType;
  status: ConversationTimerStatus;
  expiresAt: Date;
  firedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdAt: Date;
}

export interface CreateTimerParams {
  conversationId: string;
  timerType: ConversationTimerType;
  durationMs: number;
}

// ============================================
// CONVERSATION PARTICIPANTS (Groups)
// ============================================

export type ParticipantRole = 'admin' | 'member';

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  contactId: string;
  channelParticipantId: string; // JID, telegram user ID, etc.
  role: ParticipantRole;
  name?: string;
  joinedAt: Date;
  leftAt?: Date;
}

// ============================================
// CONVERSATION ASSIGNMENT
// ============================================

export interface ConversationAssignment {
  conversationId: string;
  agentId: string;
  agentName: string;
  assignedAt: Date;
  assignedBy?: string;
  previousAgentId?: string;
}

// ============================================
// CONVERSATION CONFIGURATION
// ============================================

export interface ConversationConfig {
  // Per-conversation timeout overrides (null = use account defaults)
  customInactivityTimeoutMs?: number | null;
  customCloseTimeoutMs?: number | null;
}

export const CONVERSATION_CONFIG = {
  // Default timers
  DEFAULT_INACTIVITY_TIMEOUT_MS: 86400000,   // 24 hours
  DEFAULT_CLOSE_TIMEOUT_MS: 604800000,       // 7 days
  MIN_INACTIVITY_TIMEOUT_MS: 3600000,        // 1 hour minimum
  MIN_CLOSE_TIMEOUT_MS: 86400000,            // 1 day minimum
  MAX_INACTIVITY_TIMEOUT_MS: 604800000,      // 7 days maximum
  MAX_CLOSE_TIMEOUT_MS: 2592000000,          // 30 days maximum

  // Timer check interval
  TIMER_CHECK_INTERVAL_MS: 60000,            // 1 minute
} as const;

// ============================================
// CONVERSATION STATE TRANSITIONS
// ============================================

export const VALID_STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  active: ['inactive', 'closed'],
  inactive: ['active', 'closed'],
  closed: ['active'], // Can be reopened
};

export type StateChangeReason =
  | 'new_message'           // Contact sent message - reactivates
  | 'agent_reply'           // Agent sent message - reactivates
  | 'inactivity_timeout'    // Timer fired - becomes inactive
  | 'close_timeout'         // Timer fired - becomes closed
  | 'manual_close'          // Agent manually closed
  | 'manual_reopen'         // Agent manually reopened
  | 'resolved'              // Marked as resolved
  | 'spam'                  // Marked as spam
  | 'bulk_close';           // Bulk operation

// ============================================
// CONVERSATION API PARAMS
// ============================================

export interface UpdateConversationStateParams {
  state: ConversationState;
  reason: StateChangeReason;
}

export interface ConversationStateInfo {
  conversationId: string;
  currentState: ConversationState;
  stateChangedAt: Date;
  closedAt?: Date;
  closedReason?: string;
  inactivityTimer?: ConversationTimer;
  closeTimer?: ConversationTimer;
  history: ConversationStateChange[];
}

// ============================================
// TYPING INDICATORS
// ============================================

export interface TypingIndicator {
  id: string;
  conversationId: string;
  participantId: string;
  participantType: 'contact' | 'agent';
  participantName?: string;
  startedAt: Date;
  expiresAt: Date;
}

export const TYPING_CONFIG = {
  // Typing indicator TTL
  TYPING_TTL_MS: 10000,        // 10 seconds
  // Renewal threshold
  RENEWAL_THRESHOLD_MS: 3000,  // Renew if less than 3 seconds left
} as const;

// ============================================
// CONVERSATION FILTERS
// ============================================

export interface ConversationFilterParams {
  accountId?: string;
  channelType?: ChannelType;
  state?: ConversationState;
  assignedAgentId?: string;
  isGroup?: boolean;
  hasUnread?: boolean;
  labelIds?: string[];
  searchQuery?: string;
  // Pagination
  limit?: number;
  offset?: number;
  // Sorting
  sortBy?: 'lastMessageAt' | 'createdAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ConversationListResult {
  conversations: ConversationWithDetails[];
  total: number;
  hasMore: boolean;
}

export interface ConversationWithDetails {
  id: string;
  accountId: string;
  channelType: ChannelType;
  isGroup: boolean;
  state: ConversationState;
  stateChangedAt: Date;
  lastMessageAt?: Date;
  unreadCount: number;
  // Contact/Group info
  contactId?: string;
  contactName?: string;
  contactProfilePic?: string;
  groupId?: string;
  groupName?: string;
  // Assignment
  assignedAgentId?: string;
  assignedAgentName?: string;
  // Last message preview
  lastMessageContent?: string;
  lastMessageSenderType?: 'agent' | 'contact' | 'system';
  // Labels
  labels?: Array<{ id: string; name: string; color: string }>;
  // Timestamps
  createdAt: Date;
  closedAt?: Date;
}

// ============================================
// BULK OPERATIONS
// ============================================

export interface BulkConversationParams {
  conversationIds: string[];
  action: 'close' | 'reopen' | 'assign' | 'unassign' | 'add_label' | 'remove_label';
  agentId?: string;
  labelId?: string;
  reason?: string;
}

export interface BulkConversationResult {
  successful: string[];
  failed: Array<{ conversationId: string; error: string }>;
}
