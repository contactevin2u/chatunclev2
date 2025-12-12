import { Pool, PoolConfig, QueryResult } from 'pg';
import { config } from './env';

/**
 * Database Connection Pool Configuration
 *
 * Optimized settings for production workloads:
 * - Connection pooling to reduce connection overhead
 * - Statement timeout to prevent long-running queries
 * - Idle timeout to release unused connections
 * - Connection limits based on Render's PostgreSQL tier
 *
 * SSL Configuration Notes:
 * - Render.com managed PostgreSQL uses SSL but with certificates that require
 *   rejectUnauthorized: false for internal connections
 * - The connection is still encrypted via SSL/TLS
 * - If using external PostgreSQL with proper CA certificates, set
 *   DATABASE_SSL_CA environment variable with the CA certificate
 */

// Determine SSL configuration based on environment
function getSSLConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (config.nodeEnv !== 'production') {
    return false;
  }

  // If a CA certificate is provided, use strict SSL validation
  if (process.env.DATABASE_SSL_CA) {
    return {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_SSL_CA,
    };
  }

  // For Render.com and similar managed services that use internal SSL
  // The connection is still encrypted, just without CA verification
  return { rejectUnauthorized: false };
}

const poolConfig: PoolConfig = {
  connectionString: config.databaseUrl,
  ssl: getSSLConfig(),

  // ============ MAXIMUM SPEED POOL SETTINGS (2GB RAM) ============
  // Connection pool settings - aggressive for parallel processing
  max: 75,                          // 75 connections (1GB DB can handle ~100)
  min: 10,                          // 10 warm connections ready
  idleTimeoutMillis: 120000,        // 2 min idle timeout (keep connections warm)
  connectionTimeoutMillis: 5000,    // 5 second connection timeout (fail fast)

  // Query settings - fast timeouts
  statement_timeout: 15000,         // 15 second query timeout (fail fast)
  query_timeout: 15000,

  // Keep connections alive and responsive
  keepAlive: true,
  keepAliveInitialDelayMillis: 1000, // 1 second keepalive start

  // Allow queue when pool is full
  allowExitOnIdle: false,
};

export const pool = new Pool(poolConfig);

// Connection pool event handlers
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
  // Don't exit - let the pool recover
});

pool.on('connect', (client) => {
  if (config.nodeEnv === 'development') {
    console.log('[DB] New client connected to pool');
  }
});

pool.on('remove', (client) => {
  if (config.nodeEnv === 'development') {
    console.log('[DB] Client removed from pool');
  }
});

// Log pool statistics periodically
setInterval(() => {
  const waitingCount = pool.waitingCount;
  const totalCount = pool.totalCount;
  const idleCount = pool.idleCount;

  // Always log if there are waiting connections (potential bottleneck)
  if (waitingCount > 0) {
    console.warn(`[DB Pool] WARNING: ${waitingCount} queries waiting! Total: ${totalCount}, Idle: ${idleCount}`);
  } else if (config.nodeEnv === 'development') {
    console.log(`[DB Pool] Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`);
  }
}, 30000); // Check every 30 seconds

/**
 * Execute a query and return all rows
 * @param text SQL query string
 * @param params Query parameters
 * @returns Array of rows
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 50ms) - lower threshold for early warning
    if (duration > 50) {
      console.log(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
    }

    return result.rows;
  } catch (error: any) {
    console.error('[DB] Query error:', error.message);
    console.error('[DB] Query:', text.substring(0, 200));
    throw error;
  }
}

/**
 * Execute a query and return the first row or null
 * @param text SQL query string
 * @param params Query parameters
 * @returns First row or null
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

/**
 * Execute a query and return the number of affected rows
 * @param text SQL query string
 * @param params Query parameters
 * @returns Number of affected rows
 */
export async function execute(text: string, params?: any[]): Promise<number> {
  const result = await pool.query(text, params);
  return result.rowCount || 0;
}

/**
 * Execute a transaction with multiple queries
 * @param callback Function that receives a client to execute queries
 * @returns Result of the callback
 */
export async function transaction<T>(
  callback: (client: {
    query: (text: string, params?: any[]) => Promise<QueryResult<any>>;
    queryOne: <R = any>(text: string, params?: any[]) => Promise<R | null>;
  }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await callback({
      query: (text, params) => client.query(text, params),
      queryOne: async <R = any>(text: string, params?: any[]): Promise<R | null> => {
        const res = await client.query(text, params);
        return res.rows[0] || null;
      },
    });

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database health
 * @returns Object with connection status and latency
 */
export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number; poolStats: any }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      ok: true,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  }
}

/**
 * Gracefully close all pool connections
 */
export async function closePool(): Promise<void> {
  console.log('[DB] Closing connection pool...');
  await pool.end();
  console.log('[DB] Connection pool closed');
}

// Handle process termination
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});
