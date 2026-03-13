import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (client) return client;

  client = new Redis({
    host:                 env.redis.host,
    port:                 env.redis.port,
    password:             env.redis.password,
    tls:                  env.redis.tls ? {} : undefined,
    maxRetriesPerRequest: 1,
    enableReadyCheck:     true,
    lazyConnect:          false,
  });

  client.on('connect', () => logger.info('Redis', 'Connected', { host: env.redis.host }));
  client.on('error',   (err) => logger.error('Redis', 'Error', { error: err.message }));
  client.on('close',   () => logger.warn('Redis', 'Connection closed'));

  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis', 'Client closed');
  }
}
