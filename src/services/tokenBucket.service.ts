import { BucketRepository } from '../repositories/bucket.repository';
import { RateLimitOptions, RateLimitResult, RateLimiterConfig } from '../models/rateLimit.types';
import { LocalCache } from './localCache';
import { logger } from '../config/logger';
import { incrementRedisErrors } from './metrics.service';

export class TokenBucketService {
  private readonly cache: LocalCache | null;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: BucketRepository,
    private readonly config: RateLimiterConfig,
  ) {
    this.cache = config.localCacheEnabled
      ? new LocalCache(config.localCacheTtlMs)
      : null;

    if (this.cache) {
      // Evict expired entries every 60s to prevent unbounded memory growth.
      // unref() so this timer doesn't keep the Node process alive on shutdown.
      this.evictionInterval = setInterval(() => this.cache?.evictExpired(), 60_000);
      this.evictionInterval.unref();
    }
  }

  async checkLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    // Local cache fast-path: skip Redis entirely for keys well under their limit.
    // Only cache "definitely allowed" results to avoid serving stale denials.
    if (this.cache) {
      const cached = this.cache.get(options.key);
      if (cached !== undefined) {
        logger.debug('TokenBucketService', 'Local cache hit', { key: options.key, remaining: cached });
        return { allowed: true, remaining: cached, retryAfterMs: 0 };
      }
    }

    try {
      const result = await this.repo.checkAndConsume(options);

      // Populate cache only when remaining is well above zero (>20% of capacity)
      // to avoid serving cached "allowed" when approaching the limit.
      if (this.cache && result.allowed && result.remaining > options.capacity * 0.2) {
        this.cache.set(options.key, result.remaining);
      }

      return result;
    } catch (err: unknown) {
      incrementRedisErrors(); // track Redis health degradation in metrics
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('TokenBucketService', 'Redis error — applying fail policy', {
        key: options.key,
        policy: this.config.failPolicy,
        error: msg,
      });
      return this.applyFailPolicy();
    }
  }

  /** Release the eviction timer — call on graceful shutdown if needed. */
  destroy(): void {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }
  }

  private applyFailPolicy(): RateLimitResult {
    if (this.config.failPolicy === 'open') {
      // Allow the request; signal degraded state with remaining = -1
      return { allowed: true, remaining: -1, retryAfterMs: 0 };
    }
    // Deny the request to protect resources
    return { allowed: false, remaining: 0, retryAfterMs: -1 };
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────────

let _instance: TokenBucketService | null = null;

export function getTokenBucketService(): TokenBucketService {
  if (!_instance) {
    const { getRedisClient } = require('../config/redis');
    const { env } = require('../config/env');
    const repo = new BucketRepository(getRedisClient());
    _instance = new TokenBucketService(repo, {
      capacity:          env.rateLimit.capacity,
      refillPerSec:      env.rateLimit.refillPerSec,
      failPolicy:        env.rateLimit.failPolicy,
      localCacheEnabled: env.rateLimit.localCacheEnabled,
      localCacheTtlMs:   env.rateLimit.localCacheTtlMs,
    });
  }
  return _instance;
}

/** Reset singleton — for use in tests only */
export function _resetTokenBucketService(): void {
  _instance?.destroy();
  _instance = null;
}
