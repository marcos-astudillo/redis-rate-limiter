import { Pool } from 'pg';
import { env } from './env';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    host:                    env.db.host,
    port:                    env.db.port,
    database:                env.db.name,
    user:                    env.db.user,
    password:                env.db.password,
    max:                     10,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 2_000,
    // Railway PostgreSQL requires SSL; disabled for local dev unless DB_SSL=true
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    logger.error('Database', 'Pool error', { error: err.message });
  });

  logger.info('Database', 'Pool created', { host: env.db.host, db: env.db.name, ssl: env.db.ssl });
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database', 'Pool closed');
  }
}

/**
 * Run the idempotent schema migration on startup.
 * Reads scripts/schema.sql relative to the project root (process.cwd()).
 * Safe to call every time the app starts — uses IF NOT EXISTS and ON CONFLICT DO NOTHING.
 */
export async function runMigration(): Promise<void> {
  const schemaPath = path.join(process.cwd(), 'scripts', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    logger.warn('Database', 'schema.sql not found — skipping migration', { path: schemaPath });
    return;
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  const db = getDbPool();

  logger.info('Database', 'Running startup migration...');
  await db.query(sql);
  logger.info('Database', 'Migration complete');
}
