import { eq, and, sql } from 'drizzle-orm';
import type {
  ConversationState,
  StateChangeReason,
  ConversationTimerType,
  CONVERSATION_CONFIG,
  VALID_STATE_TRANSITIONS,
} from '@chatuncle/shared';
import { db } from '../db/index.js';
import {
  conversations,
  conversationTimers,
  conversationStateHistory,
} from '../db/schema.js';
import { webhookService } from './webhooks.js';

const STATE_CONFIG = {
  DEFAULT_INACTIVITY_TIMEOUT_MS: 86400000,   // 24 hours
  DEFAULT_CLOSE_TIMEOUT_MS: 604800000,       // 7 days
  MIN_INACTIVITY_TIMEOUT_MS: 3600000,        // 1 hour
  MIN_CLOSE_TIMEOUT_MS: 86400000,            // 1 day
  MAX_INACTIVITY_TIMEOUT_MS: 604800000,      // 7 days
  MAX_CLOSE_TIMEOUT_MS: 2592000000,          // 30 days
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['inactive', 'closed'],
  inactive: ['active', 'closed'],
  closed: ['active'],
};

/**
 * Conversation state service for Twilio-like state management
 *
 * States: active -> inactive -> closed
 *
 * Features:
 * - Automatic state transitions based on inactivity
 * - Configurable timeouts per conversation
 * - State change history tracking
 * - Timer-based automation
 */
export class ConversationStateService {
  /**
   * Change conversation state
   */
  async changeState(
    conversationId: string,
    newState: ConversationState,
    reason: StateChangeReason,
    triggeredBy: 'system' | 'agent' | 'timer' = 'system',
    agentId?: string
  ): Promise<boolean> {
    // Get current conversation
    const conv = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv.length === 0) {
      console.error(`[ConversationState] Conversation ${conversationId} not found`);
      return false;
    }

    const currentState = conv[0].state as ConversationState;
    const accountId = conv[0].accountId;

    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      console.warn(
        `[ConversationState] Invalid transition: ${currentState} -> ${newState}`
      );
      return false;
    }

    const now = new Date();

    // Update conversation state
    await db
      .update(conversations)
      .set({
        state: newState,
        stateChangedAt: now,
        closedAt: newState === 'closed' ? now : null,
        closedReason: newState === 'closed' ? reason : null,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));

    // Record state change history
    await db.insert(conversationStateHistory).values({
      conversationId,
      previousState: currentState,
      newState,
      reason,
      triggeredBy,
      agentId,
    });

    // Cancel existing timers if transitioning to closed
    if (newState === 'closed') {
      await this.cancelAllTimers(conversationId, agentId);
    }

    // Set up new timers if transitioning to active
    if (newState === 'active' && currentState !== 'active') {
      await this.resetTimers(conversationId);
    }

    // Queue webhook
    await webhookService.queueWebhook(accountId, 'conversation.state_changed', {
      conversationId,
      previousState: currentState,
      currentState: newState,
      reason,
      triggeredBy,
      timestamp: now.toISOString(),
    });

    return true;
  }

  /**
   * Check if state transition is valid
   */
  isValidTransition(from: ConversationState, to: ConversationState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }

  /**
   * Reactivate conversation on new message
   */
  async reactivateOnMessage(conversationId: string): Promise<void> {
    const conv = await db
      .select({ state: conversations.state, accountId: conversations.accountId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv.length === 0) return;

    const currentState = conv[0].state as ConversationState;

    // Only reactivate if not already active
    if (currentState !== 'active') {
      await this.changeState(
        conversationId,
        'active',
        'new_message',
        'system'
      );
    } else {
      // Just reset timers for active conversations
      await this.resetInactivityTimer(conversationId);
    }
  }

  /**
   * Reset inactivity timer
   */
  async resetInactivityTimer(conversationId: string): Promise<void> {
    // Cancel existing inactivity timer
    await this.cancelTimer(conversationId, 'inactivity');

    // Get conversation timeout settings
    const conv = await db
      .select({
        customInactivityTimeoutMs: conversations.customInactivityTimeoutMs,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv.length === 0) return;

    const timeoutMs = conv[0].customInactivityTimeoutMs
      ?? STATE_CONFIG.DEFAULT_INACTIVITY_TIMEOUT_MS;

    // Create new inactivity timer
    await this.createTimer(conversationId, 'inactivity', timeoutMs);
  }

  /**
   * Reset all timers for a conversation
   */
  async resetTimers(conversationId: string): Promise<void> {
    // Cancel existing timers
    await this.cancelAllTimers(conversationId);

    // Get conversation timeout settings
    const conv = await db
      .select({
        customInactivityTimeoutMs: conversations.customInactivityTimeoutMs,
        customCloseTimeoutMs: conversations.customCloseTimeoutMs,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv.length === 0) return;

    const inactivityMs = conv[0].customInactivityTimeoutMs
      ?? STATE_CONFIG.DEFAULT_INACTIVITY_TIMEOUT_MS;

    // Create inactivity timer
    await this.createTimer(conversationId, 'inactivity', inactivityMs);
  }

  /**
   * Create a timer
   */
  async createTimer(
    conversationId: string,
    timerType: ConversationTimerType,
    durationMs: number
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + durationMs);

    const [timer] = await db
      .insert(conversationTimers)
      .values({
        conversationId,
        timerType,
        status: 'active',
        expiresAt,
      })
      .returning();

    return timer.id;
  }

  /**
   * Cancel a specific timer type
   */
  async cancelTimer(
    conversationId: string,
    timerType: ConversationTimerType,
    cancelledBy?: string
  ): Promise<void> {
    await db
      .update(conversationTimers)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
      })
      .where(
        and(
          eq(conversationTimers.conversationId, conversationId),
          eq(conversationTimers.timerType, timerType),
          eq(conversationTimers.status, 'active')
        )
      );
  }

  /**
   * Cancel all timers for a conversation
   */
  async cancelAllTimers(conversationId: string, cancelledBy?: string): Promise<void> {
    await db
      .update(conversationTimers)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
      })
      .where(
        and(
          eq(conversationTimers.conversationId, conversationId),
          eq(conversationTimers.status, 'active')
        )
      );
  }

  /**
   * Process expired timers
   *
   * Should be run periodically (e.g., every minute)
   */
  async processExpiredTimers(): Promise<number> {
    const now = new Date();

    // Find expired active timers
    const expiredTimers = await db
      .select()
      .from(conversationTimers)
      .where(
        and(
          eq(conversationTimers.status, 'active'),
          sql`${conversationTimers.expiresAt} < ${now}`
        )
      )
      .limit(100);

    if (expiredTimers.length === 0) {
      return 0;
    }

    console.log(`[ConversationState] Processing ${expiredTimers.length} expired timers`);

    for (const timer of expiredTimers) {
      await this.fireTimer(timer.id, timer.conversationId, timer.timerType);
    }

    return expiredTimers.length;
  }

  /**
   * Fire a timer (execute its action)
   */
  private async fireTimer(
    timerId: string,
    conversationId: string,
    timerType: string
  ): Promise<void> {
    // Mark timer as fired
    await db
      .update(conversationTimers)
      .set({
        status: 'fired',
        firedAt: new Date(),
      })
      .where(eq(conversationTimers.id, timerId));

    // Execute timer action
    if (timerType === 'inactivity') {
      // Get current state
      const conv = await db
        .select({
          state: conversations.state,
          customCloseTimeoutMs: conversations.customCloseTimeoutMs,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (conv.length > 0 && conv[0].state === 'active') {
        // Transition to inactive
        await this.changeState(
          conversationId,
          'inactive',
          'inactivity_timeout',
          'timer'
        );

        // Create close timer
        const closeMs = conv[0].customCloseTimeoutMs
          ?? STATE_CONFIG.DEFAULT_CLOSE_TIMEOUT_MS;
        await this.createTimer(conversationId, 'close', closeMs);
      }
    } else if (timerType === 'close') {
      // Get current state
      const conv = await db
        .select({ state: conversations.state })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (conv.length > 0 && conv[0].state === 'inactive') {
        // Transition to closed
        await this.changeState(
          conversationId,
          'closed',
          'close_timeout',
          'timer'
        );
      }
    }
  }

  /**
   * Get conversation state info
   */
  async getStateInfo(conversationId: string) {
    const conv = await db
      .select({
        state: conversations.state,
        stateChangedAt: conversations.stateChangedAt,
        closedAt: conversations.closedAt,
        closedReason: conversations.closedReason,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv.length === 0) {
      return null;
    }

    // Get active timers
    const timers = await db
      .select()
      .from(conversationTimers)
      .where(
        and(
          eq(conversationTimers.conversationId, conversationId),
          eq(conversationTimers.status, 'active')
        )
      );

    // Get recent history
    const history = await db
      .select()
      .from(conversationStateHistory)
      .where(eq(conversationStateHistory.conversationId, conversationId))
      .orderBy(conversationStateHistory.createdAt)
      .limit(10);

    const c = conv[0];
    return {
      conversationId,
      currentState: c.state as ConversationState,
      stateChangedAt: c.stateChangedAt,
      closedAt: c.closedAt,
      closedReason: c.closedReason,
      timers: {
        inactivity: timers.find(t => t.timerType === 'inactivity'),
        close: timers.find(t => t.timerType === 'close'),
      },
      history,
    };
  }

  /**
   * Set custom timeout for a conversation
   */
  async setCustomTimeout(
    conversationId: string,
    type: 'inactivity' | 'close',
    timeoutMs: number
  ): Promise<void> {
    // Validate timeout
    if (type === 'inactivity') {
      timeoutMs = Math.max(STATE_CONFIG.MIN_INACTIVITY_TIMEOUT_MS, timeoutMs);
      timeoutMs = Math.min(STATE_CONFIG.MAX_INACTIVITY_TIMEOUT_MS, timeoutMs);

      await db
        .update(conversations)
        .set({ customInactivityTimeoutMs: timeoutMs })
        .where(eq(conversations.id, conversationId));
    } else {
      timeoutMs = Math.max(STATE_CONFIG.MIN_CLOSE_TIMEOUT_MS, timeoutMs);
      timeoutMs = Math.min(STATE_CONFIG.MAX_CLOSE_TIMEOUT_MS, timeoutMs);

      await db
        .update(conversations)
        .set({ customCloseTimeoutMs: timeoutMs })
        .where(eq(conversations.id, conversationId));
    }

    // Reset timers with new timeout
    await this.resetTimers(conversationId);
  }

  /**
   * Bulk close conversations
   */
  async bulkClose(
    conversationIds: string[],
    reason: StateChangeReason,
    agentId: string
  ): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of conversationIds) {
      try {
        const success = await this.changeState(id, 'closed', reason, 'agent', agentId);
        if (success) {
          successful.push(id);
        } else {
          failed.push({ id, error: 'State transition failed' });
        }
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed };
  }
}

// Singleton instance
export const conversationStateService = new ConversationStateService();
