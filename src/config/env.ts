import dotenv from 'dotenv';
import { FailPolicy } from '../models/rateLimit.types';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),

  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: optional('REDIS_TLS', 'false') === 'true',
  },

  rateLimit: {
    enabled: optional('RATE_LIMIT_ENABLED', 'true') === 'true',
    capacity: parseInt(optional('RATE_LIMIT_CAPACITY', '100'), 10),
    refillPerSec: parseFloat(optional('RATE_LIMIT_REFILL_PER_SEC', '10')),
    windowSec: parseInt(optional('RATE_LIMIT_WINDOW_SEC', '60'), 10),
    failPolicy: optional('RATE_LIMIT_FAIL_POLICY', 'open') as FailPolicy,
    localCacheEnabled: optional('RATE_LIMIT_LOCAL_CACHE_ENABLED', 'false') === 'true',
    localCacheTtlMs: parseInt(optional('RATE_LIMIT_LOCAL_CACHE_TTL_MS', '500'), 10),
  },

  logLevel: optional('LOG_LEVEL', 'info'),
} as const;
