import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config/env.js';
import { BATCH_CONFIG } from '../config/constants.js';
import * as schema from './schema.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: BATCH_CONFIG.DB_POOL_SIZE,
  idleTimeoutMillis: BATCH_CONFIG.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: 10000,
  ssl: config.isProd ? { rejectUnauthorized: false } : undefined,
});

// Log pool events in development
if (config.isDev) {
  pool.on('connect', () => {
    console.log('📊 New database connection established');
  });

  pool.on('error', (err) => {
    console.error('❌ Database pool error:', err);
  });
}

// Create Drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export pool for raw queries if needed
export { pool };

// Export schema
export * from './schema.js';

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Close database pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('📊 Database pool closed');
}
