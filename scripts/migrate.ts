import fs from 'fs';
import path from 'path';
import { getDbPool, closeDbPool } from '../src/config/database';

async function migrate(): Promise<void> {
  const pool = getDbPool();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  console.log('[migrate] Running schema...');
  await pool.query(sql);
  console.log('[migrate] Done.');

  await closeDbPool();
}

migrate().catch((err) => {
  console.error('[migrate] Failed:', err.message);
  process.exit(1);
});
