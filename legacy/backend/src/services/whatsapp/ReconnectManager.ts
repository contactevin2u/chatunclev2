/**
 * Reconnection Manager with Exponential Backoff
 *
 * Handles intelligent reconnection with:
 * - Exponential backoff (1s, 2s, 4s, 8s, 16s, 32s, max 60s)
 * - Jitter to prevent thundering herd
 * - Max retry limits
 * - Circuit breaker pattern
 * - Account-specific tracking
 */

interface ReconnectState {
  accountId: string;
  attempt: number;
  lastAttempt: number;
  nextDelay: number;
  isReconnecting: boolean;
  circuitOpen: boolean;
  circuitOpenTime: number;
}

const RECONNECT_CONFIG = {
  // Initial delay (ms)
  INITIAL_DELAY: 1000,
  // Maximum delay (ms)
  MAX_DELAY: 60000,
  // Backoff multiplier
  MULTIPLIER: 2,
  // Jitter factor (0-1)
  JITTER: 0.3,
  // Max consecutive failures before circuit opens
  MAX_FAILURES: 10,
  // Circuit breaker reset time (ms)
  CIRCUIT_RESET_TIME: 300000, // 5 minutes
};

class ReconnectManagerService {
  private states: Map<string, ReconnectState> = new Map();

  /**
   * Get or create state for an account
   */
  private getState(accountId: string): ReconnectState {
    if (!this.states.has(accountId)) {
      this.states.set(accountId, {
        accountId,
        attempt: 0,
        lastAttempt: 0,
        nextDelay: RECONNECT_CONFIG.INITIAL_DELAY,
        isReconnecting: false,
        circuitOpen: false,
        circuitOpenTime: 0,
      });
    }
    return this.states.get(accountId)!;
  }

  /**
   * Calculate next delay with exponential backoff and jitter
   */
  private calculateNextDelay(currentDelay: number): number {
    // Exponential increase
    let nextDelay = currentDelay * RECONNECT_CONFIG.MULTIPLIER;

    // Cap at maximum
    nextDelay = Math.min(nextDelay, RECONNECT_CONFIG.MAX_DELAY);

    // Add jitter (random variation to prevent synchronized reconnects)
    const jitter = nextDelay * RECONNECT_CONFIG.JITTER * (Math.random() * 2 - 1);
    nextDelay = Math.max(RECONNECT_CONFIG.INITIAL_DELAY, nextDelay + jitter);

    return Math.round(nextDelay);
  }

  /**
   * Check if reconnection is allowed (circuit breaker check)
   */
  canReconnect(accountId: string): { allowed: boolean; reason?: string; waitMs?: number } {
    const state = this.getState(accountId);

    // Check circuit breaker
    if (state.circuitOpen) {
      const elapsed = Date.now() - state.circuitOpenTime;
      if (elapsed < RECONNECT_CONFIG.CIRCUIT_RESET_TIME) {
        return {
          allowed: false,
          reason: `Circuit breaker open. Reset in ${Math.round((RECONNECT_CONFIG.CIRCUIT_RESET_TIME - elapsed) / 1000)}s`,
          waitMs: RECONNECT_CONFIG.CIRCUIT_RESET_TIME - elapsed,
        };
      }
      // Reset circuit breaker
      state.circuitOpen = false;
      state.circuitOpenTime = 0;
      state.attempt = 0;
      state.nextDelay = RECONNECT_CONFIG.INITIAL_DELAY;
      console.log(`[Reconnect] Circuit breaker reset for ${accountId}`);
    }

    // Check if already reconnecting
    if (state.isReconnecting) {
      return {
        allowed: false,
        reason: 'Already reconnecting',
      };
    }

    return { allowed: true };
  }

  /**
   * Schedule a reconnection with exponential backoff
   * Returns the delay in milliseconds
   */
  scheduleReconnect(accountId: string, reconnectFn: () => Promise<void>): number {
    const state = this.getState(accountId);

    const canReconnectResult = this.canReconnect(accountId);
    if (!canReconnectResult.allowed) {
      console.log(`[Reconnect] Blocked for ${accountId}: ${canReconnectResult.reason}`);
      return -1;
    }

    state.attempt++;
    state.isReconnecting = true;

    // Check if we've exceeded max failures
    if (state.attempt >= RECONNECT_CONFIG.MAX_FAILURES) {
      console.error(`[Reconnect] Max failures reached for ${accountId}. Opening circuit breaker.`);
      state.circuitOpen = true;
      state.circuitOpenTime = Date.now();
      state.isReconnecting = false;
      return -1;
    }

    const delay = state.nextDelay;
    state.nextDelay = this.calculateNextDelay(delay);
    state.lastAttempt = Date.now();

    console.log(`[Reconnect] Scheduling reconnect for ${accountId} in ${delay}ms (attempt ${state.attempt}/${RECONNECT_CONFIG.MAX_FAILURES})`);

    setTimeout(async () => {
      try {
        await reconnectFn();
        // Success - reset state
        this.resetState(accountId);
        console.log(`[Reconnect] Success for ${accountId}`);
      } catch (error) {
        console.error(`[Reconnect] Failed for ${accountId}:`, error);
        state.isReconnecting = false;
        // Will be called again by connection.update handler
      }
    }, delay);

    return delay;
  }

  /**
   * Reset state after successful connection
   */
  resetState(accountId: string): void {
    const state = this.getState(accountId);
    state.attempt = 0;
    state.nextDelay = RECONNECT_CONFIG.INITIAL_DELAY;
    state.isReconnecting = false;
    state.circuitOpen = false;
    state.circuitOpenTime = 0;
    console.log(`[Reconnect] State reset for ${accountId}`);
  }

  /**
   * Clear state for an account (on delete/logout)
   */
  clearState(accountId: string): void {
    this.states.delete(accountId);
    console.log(`[Reconnect] Cleared state for ${accountId}`);
  }

  /**
   * Get reconnection statistics
   */
  getStats(accountId: string): {
    attempt: number;
    maxAttempts: number;
    nextDelay: number;
    isReconnecting: boolean;
    circuitOpen: boolean;
  } {
    const state = this.getState(accountId);
    return {
      attempt: state.attempt,
      maxAttempts: RECONNECT_CONFIG.MAX_FAILURES,
      nextDelay: state.nextDelay,
      isReconnecting: state.isReconnecting,
      circuitOpen: state.circuitOpen,
    };
  }

  /**
   * Force close circuit breaker (manual override)
   */
  forceReset(accountId: string): void {
    this.resetState(accountId);
    console.log(`[Reconnect] Force reset for ${accountId}`);
  }

  /**
   * Get all account states (for monitoring)
   */
  getAllStats(): Map<string, ReturnType<typeof this.getStats>> {
    const result = new Map<string, ReturnType<typeof this.getStats>>();
    for (const [accountId] of this.states) {
      result.set(accountId, this.getStats(accountId));
    }
    return result;
  }
}

// Singleton
export const reconnectManager = new ReconnectManagerService();
export { RECONNECT_CONFIG };
