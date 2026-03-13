import { Pool } from 'pg';
import { env } from './env';
import { logger } from './logger';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    host:                  env.db.host,
    port:                  env.db.port,
    database:              env.db.name,
    user:                  env.db.user,
    password:              env.db.password,
    max:                   10,
    idleTimeoutMillis:     30_000,
    connectionTimeoutMillis: 2_000,
  });

  pool.on('error', (err) => {
    logger.error('Database', 'Pool error', { error: err.message });
  });

  logger.info('Database', 'Pool created', { host: env.db.host, db: env.db.name });
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database', 'Pool closed');
  }
}
