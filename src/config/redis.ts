import Redis from 'ioredis';
import { env } from './env';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (client) return client;

  client = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    tls: env.redis.tls ? {} : undefined,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('connect', () => console.log('[Redis] Connected'));
  client.on('error', (err) => console.error('[Redis] Error:', err.message));
  client.on('close', () => console.warn('[Redis] Connection closed'));

  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
