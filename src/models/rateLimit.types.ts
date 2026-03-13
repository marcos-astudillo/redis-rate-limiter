export interface RateLimitOptions {
  key: string;
  capacity: number;
  refillPerSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export type FailPolicy = 'open' | 'closed';

export interface RateLimiterConfig {
  capacity: number;
  refillPerSec: number;
  failPolicy: FailPolicy;
  localCacheEnabled: boolean;
  localCacheTtlMs: number;
}
