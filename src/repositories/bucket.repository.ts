import Redis from 'ioredis';
import { RateLimitOptions, RateLimitResult } from '../models/rateLimit.types';
import { TOKEN_BUCKET_SCRIPT } from '../scripts/tokenBucket';
import { logger } from '../config/logger';

export class BucketRepository {
  private sha: string | null = null;

  constructor(private readonly redis: Redis) {}

  async checkAndConsume(options: RateLimitOptions): Promise<RateLimitResult> {
    const { key, capacity, refillPerSec } = options;
    const nowMs = Date.now();
    // TTL = 2× the time to fully refill an empty bucket
    const ttlSec = Math.ceil((capacity / refillPerSec) * 2);
    const redisKey = `bucket:${key}`;

    const [allowed, remaining, retryAfterMs] = await this.execScript(
      [redisKey],
      [capacity, refillPerSec, nowMs, ttlSec],
    );

    return {
      allowed: allowed === 1,
      remaining,
      retryAfterMs,
    };
  }

  /**
   * Executes the Lua script via EVALSHA (cached) with automatic reload on NOSCRIPT.
   * Using EVALSHA avoids re-sending the full script on every request.
   * Max 2 retries to guard against infinite loops on persistent script eviction.
   */
  private async execScript(keys: string[], args: number[], attempt = 0): Promise<number[]> {
    const MAX_ATTEMPTS = 2;
    const strArgs = args.map(String);

    if (!this.sha) {
      this.sha = (await this.redis.call('SCRIPT', 'LOAD', TOKEN_BUCKET_SCRIPT)) as string;
      logger.debug('BucketRepository', 'Lua script loaded', { sha: this.sha, attempt });
    }

    try {
      return (await this.redis.evalsha(
        this.sha,
        keys.length,
        ...keys,
        ...strArgs,
      )) as number[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NOSCRIPT') && attempt < MAX_ATTEMPTS) {
        // Script was evicted from Redis — reload and retry
        logger.warn('BucketRepository', 'NOSCRIPT — reloading script', { attempt });
        this.sha = null;
        return this.execScript(keys, args, attempt + 1);
      }
      throw err;
    }
  }
}
