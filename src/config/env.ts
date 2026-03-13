import dotenv from 'dotenv';
import { FailPolicy } from '../models/rateLimit.types';

dotenv.config();

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Parse a PostgreSQL connection URL into individual components.
 * Railway provides DATABASE_URL as:
 *   postgresql://user:password@host:port/database
 */
function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    host:     parsed.hostname,
    port:     parseInt(parsed.port || '5432', 10),
    name:     parsed.pathname.replace(/^\//, ''),
    user:     parsed.username,
    password: decodeURIComponent(parsed.password),
    ssl:      true, // Railway always requires SSL
  };
}

/**
 * Parse a Redis connection URL into individual components.
 * Railway provides REDIS_URL as:
 *   redis://:password@host:port  or  rediss://... (TLS)
 */
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host:     parsed.hostname,
    port:     parseInt(parsed.port || '6379', 10),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls:      parsed.protocol === 'rediss:',
  };
}

// Prefer single-URL format (Railway) over individual vars (local / custom deploys)
const dbFromUrl    = process.env.DATABASE_URL ? parseDbUrl(process.env.DATABASE_URL)  : null;
const redisFromUrl = process.env.REDIS_URL    ? parseRedisUrl(process.env.REDIS_URL)  : null;

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),

  redis: {
    host:     redisFromUrl?.host     ?? optional('REDIS_HOST', 'localhost'),
    port:     redisFromUrl?.port     ?? parseInt(optional('REDIS_PORT', '6379'), 10),
    password: redisFromUrl?.password ?? process.env.REDIS_PASSWORD ?? undefined,
    tls:      redisFromUrl?.tls      ?? optional('REDIS_TLS', 'false') === 'true',
  },

  db: {
    host:     dbFromUrl?.host     ?? optional('DB_HOST', 'localhost'),
    port:     dbFromUrl?.port     ?? parseInt(optional('DB_PORT', '5432'), 10),
    name:     dbFromUrl?.name     ?? optional('DB_NAME', 'rate_limiter'),
    user:     dbFromUrl?.user     ?? optional('DB_USER', 'postgres'),
    password: dbFromUrl?.password ?? optional('DB_PASSWORD', 'postgres'),
    ssl:      dbFromUrl?.ssl      ?? optional('DB_SSL', 'false') === 'true',
  },

  rateLimit: {
    enabled:           optional('RATE_LIMIT_ENABLED', 'true') === 'true',
    capacity:          parseInt(optional('RATE_LIMIT_CAPACITY', '100'), 10),
    refillPerSec:      parseFloat(optional('RATE_LIMIT_REFILL_PER_SEC', '10')),
    windowSec:         parseInt(optional('RATE_LIMIT_WINDOW_SEC', '60'), 10),
    failPolicy:        optional('RATE_LIMIT_FAIL_POLICY', 'open') as FailPolicy,
    localCacheEnabled: optional('RATE_LIMIT_LOCAL_CACHE_ENABLED', 'false') === 'true',
    localCacheTtlMs:   parseInt(optional('RATE_LIMIT_LOCAL_CACHE_TTL_MS', '500'), 10),
  },

  logLevel: optional('LOG_LEVEL', 'info'),
} as const;
