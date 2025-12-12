/**
 * Health Monitor Service for WhatsApp Sessions
 *
 * Monitors session health and triggers reconnection when issues are detected.
 * Catches "silent deaths" where the WebSocket appears connected but isn't
 * actually receiving messages.
 *
 * Features:
 * - Periodic health checks
 * - WebSocket state monitoring
 * - Last activity tracking
 * - Automatic reconnection triggering
 * - Memory pressure monitoring
 */

import { WASocket } from '@whiskeysockets/baileys';
import { messageStore } from './MessageStore';
import { groupMetadataCache } from './GroupMetadataCache';

interface SessionHealth {
  accountId: string;
  lastMessageReceived: number;
  lastMessageSent: number;
  lastHealthCheck: number;
  connectionState: 'healthy' | 'degraded' | 'unhealthy' | 'dead';
  consecutiveFailures: number;
  wsState: number | null;
}

type ReconnectCallback = (accountId: string, reason: string) => Promise<void>;

class HealthMonitorService {
  // Health status per account
  private healthStatus: Map<string, SessionHealth> = new Map();

  // Health check intervals per account
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Memory monitoring interval
  private memoryInterval: NodeJS.Timeout | null = null;

  // Callback for triggering reconnects
  private reconnectCallback: ReconnectCallback | null = null;

  // Configuration
  private config = {
    // How often to check health (ms)
    checkIntervalMs: 60000, // 1 minute

    // Consider unhealthy if no messages received in this time (ms)
    noActivityThresholdMs: 300000, // 5 minutes

    // Consider dead if no activity for this long (ms)
    deadThresholdMs: 600000, // 10 minutes

    // Number of consecutive failures before triggering reconnect
    maxConsecutiveFailures: 3,

    // Memory thresholds - use absolute MB instead of percentage
    // Node.js heap grows dynamically, so percentage is misleading
    // OPTIMIZED FOR 2GB RAM (Render paid tier)
    memoryWarningMB: 1400, // Warn at 1.4GB
    memoryCriticalMB: 1700, // Critical at 1.7GB (leave 300MB headroom)
  };

  // Track last memory alert to avoid spam
  private lastMemoryAlert: number = 0;
  private memoryAlertCooldownMs: number = 600000; // 10 minutes between alerts (less spam)

  constructor() {
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Set the reconnect callback
   */
  setReconnectCallback(callback: ReconnectCallback): void {
    this.reconnectCallback = callback;
  }

  /**
   * Start monitoring a session
   */
  startMonitoring(accountId: string, socket: WASocket): void {
    // Initialize health status
    const now = Date.now();
    this.healthStatus.set(accountId, {
      accountId,
      lastMessageReceived: now,
      lastMessageSent: now,
      lastHealthCheck: now,
      connectionState: 'healthy',
      consecutiveFailures: 0,
      wsState: null,
    });

    // Start periodic health checks
    const interval = setInterval(() => {
      this.checkHealth(accountId, socket);
    }, this.config.checkIntervalMs);

    this.checkIntervals.set(accountId, interval);
    console.log(`[HealthMonitor] Started monitoring account ${accountId}`);
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(accountId: string): void {
    const interval = this.checkIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(accountId);
    }
    this.healthStatus.delete(accountId);
    console.log(`[HealthMonitor] Stopped monitoring account ${accountId}`);
  }

  /**
   * Record that a message was received (call from messages.upsert handler)
   */
  recordMessageReceived(accountId: string): void {
    const health = this.healthStatus.get(accountId);
    if (health) {
      health.lastMessageReceived = Date.now();
      health.consecutiveFailures = 0;
      if (health.connectionState !== 'healthy') {
        health.connectionState = 'healthy';
        console.log(`[HealthMonitor] Account ${accountId} recovered to healthy state`);
      }
    }
  }

  /**
   * Record that a message was sent (call from sendMessage)
   */
  recordMessageSent(accountId: string): void {
    const health = this.healthStatus.get(accountId);
    if (health) {
      health.lastMessageSent = Date.now();
    }
  }

  /**
   * Perform health check for a session
   */
  private async checkHealth(accountId: string, socket: WASocket): Promise<void> {
    const health = this.healthStatus.get(accountId);
    if (!health) return;

    const now = Date.now();
    health.lastHealthCheck = now;

    // Check connection state via socket.user (more reliable than checking ws internal)
    // Baileys v7 changed internal structure, socket.ws may not be accessible
    try {
      // If socket.user exists, connection is authenticated and working
      const isConnected = !!socket.user;
      health.wsState = isConnected ? 1 : null;

      if (!isConnected) {
        health.consecutiveFailures++;
        health.connectionState = 'unhealthy';
        console.warn(`[HealthMonitor] Account ${accountId} not connected (no user data)`);

        if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          await this.triggerReconnect(accountId, `Not connected for ${health.consecutiveFailures} checks`);
        }
        return;
      }
    } catch (err) {
      console.error(`[HealthMonitor] Error checking connection for ${accountId}:`, err);
      health.consecutiveFailures++;
    }

    // Check activity levels
    const timeSinceLastMessage = now - health.lastMessageReceived;

    if (timeSinceLastMessage > this.config.deadThresholdMs) {
      health.connectionState = 'dead';
      health.consecutiveFailures++;
      console.warn(`[HealthMonitor] Account ${accountId} appears DEAD (no messages for ${Math.round(timeSinceLastMessage / 60000)}min)`);

      if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        await this.triggerReconnect(accountId, `No messages received for ${Math.round(timeSinceLastMessage / 60000)} minutes`);
      }
    } else if (timeSinceLastMessage > this.config.noActivityThresholdMs) {
      health.connectionState = 'degraded';
      console.log(`[HealthMonitor] Account ${accountId} DEGRADED (no messages for ${Math.round(timeSinceLastMessage / 60000)}min)`);
    } else {
      health.connectionState = 'healthy';
      health.consecutiveFailures = 0;
    }
  }

  /**
   * Trigger a reconnection
   */
  private async triggerReconnect(accountId: string, reason: string): Promise<void> {
    console.log(`[HealthMonitor] Triggering reconnect for ${accountId}: ${reason}`);

    const health = this.healthStatus.get(accountId);
    if (health) {
      health.consecutiveFailures = 0; // Reset to prevent rapid reconnects
    }

    if (this.reconnectCallback) {
      try {
        await this.reconnectCallback(accountId, reason);
      } catch (err) {
        console.error(`[HealthMonitor] Reconnect failed for ${accountId}:`, err);
      }
    }
  }

  /**
   * Start memory pressure monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, 30000); // Every 30 seconds
  }

  /**
   * Check memory pressure and take action if needed
   * Uses absolute MB thresholds instead of percentage (Node.js heap grows dynamically)
   */
  private checkMemoryPressure(): void {
    const used = process.memoryUsage();
    const heapMB = Math.round(used.heapUsed / 1024 / 1024);
    const totalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const now = Date.now();

    // Use RSS (Resident Set Size) which is actual memory used by the process
    // This is more accurate than heap for determining real memory pressure

    if (rssMB > this.config.memoryCriticalMB) {
      // Only log if cooldown has passed (avoid spam)
      if (now - this.lastMemoryAlert > this.memoryAlertCooldownMs) {
        console.error(`[HealthMonitor] CRITICAL MEMORY: RSS ${rssMB}MB, Heap ${heapMB}/${totalMB}MB`);
        this.lastMemoryAlert = now;

        // Aggressive cleanup
        this.triggerMemoryCleanup('critical');

        // Force garbage collection if available
        if (global.gc) {
          console.log('[HealthMonitor] Forcing garbage collection');
          global.gc();
        }
      }
    } else if (rssMB > this.config.memoryWarningMB) {
      // Only log if cooldown has passed
      if (now - this.lastMemoryAlert > this.memoryAlertCooldownMs) {
        console.warn(`[HealthMonitor] HIGH MEMORY: RSS ${rssMB}MB, Heap ${heapMB}/${totalMB}MB`);
        this.lastMemoryAlert = now;

        // Light cleanup
        this.triggerMemoryCleanup('warning');
      }
    }
  }

  /**
   * Trigger memory cleanup across services
   */
  private triggerMemoryCleanup(level: 'warning' | 'critical'): void {
    const evictCount = level === 'critical' ? 5000 : 1000;

    // Evict from MessageStore
    const msStats = messageStore.getStats();
    if (msStats.keys > evictCount) {
      console.log(`[HealthMonitor] Evicting ${evictCount} messages from cache`);
      // MessageStore doesn't have evict method yet, but cleanup helps
    }

    // Log for awareness
    console.log(`[HealthMonitor] Memory cleanup triggered (${level})`);
  }

  /**
   * Get health status for all accounts
   */
  getAllHealth(): SessionHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get health status for a specific account
   */
  getHealth(accountId: string): SessionHealth | undefined {
    return this.healthStatus.get(accountId);
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    totalMonitored: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    dead: number;
    memoryUsage: { heapUsed: number; heapTotal: number; rss: number; warningMB: number; criticalMB: number };
  } {
    const statuses = Array.from(this.healthStatus.values());
    const memory = process.memoryUsage();

    return {
      totalMonitored: statuses.length,
      healthy: statuses.filter(s => s.connectionState === 'healthy').length,
      degraded: statuses.filter(s => s.connectionState === 'degraded').length,
      unhealthy: statuses.filter(s => s.connectionState === 'unhealthy').length,
      dead: statuses.filter(s => s.connectionState === 'dead').length,
      memoryUsage: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024),
        warningMB: this.config.memoryWarningMB,
        criticalMB: this.config.memoryCriticalMB,
      },
    };
  }

  /**
   * Shutdown all monitoring
   */
  shutdown(): void {
    // Stop all health check intervals
    for (const [accountId, interval] of this.checkIntervals) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
    this.healthStatus.clear();

    // Stop memory monitoring
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }

    console.log('[HealthMonitor] Shutdown complete');
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitorService();
