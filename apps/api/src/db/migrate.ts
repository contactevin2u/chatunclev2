import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.isProd ? { rejectUnauthorized: false } : undefined,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
