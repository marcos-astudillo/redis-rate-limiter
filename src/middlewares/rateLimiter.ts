import { Request, Response, NextFunction } from 'express';
import { getTokenBucketService } from '../services/tokenBucket.service';
import { KeyExtractor, byApiKeyOrUser } from '../services/keyExtractor';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { incrementAllowed, incrementDenied, incrementTotal } from '../services/metrics.service';

export interface RateLimiterOptions {
  /** Custom key extraction strategy. Defaults to byApiKeyOrUser. */
  keyExtractor?: KeyExtractor;
  /** Max tokens (burst capacity). Defaults to RATE_LIMIT_CAPACITY env var. */
  capacity?: number;
  /** Tokens refilled per second. Defaults to RATE_LIMIT_REFILL_PER_SEC env var. */
  refillPerSec?: number;
  /**
   * Override fail policy for this middleware instance.
   * Defaults to RATE_LIMIT_FAIL_POLICY env var.
   */
  failPolicy?: 'open' | 'closed';
}

/**
 * rateLimiter() — Express middleware factory.
 *
 * Usage (per-route):
 *   router.post('/orders', rateLimiter({ capacity: 50, refillPerSec: 5 }), handler)
 *
 * Usage (global):
 *   app.use(rateLimiter())
 *
 * Usage (custom key):
 *   rateLimiter({ keyExtractor: byIpAndRoute })
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
  const extract      = options.keyExtractor ?? byApiKeyOrUser;
  const capacity     = options.capacity    ?? env.rateLimit.capacity;
  const refillPerSec = options.refillPerSec ?? env.rateLimit.refillPerSec;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!env.rateLimit.enabled) {
      next();
      return;
    }

    const key = extract(req);

    try {
      const service = getTokenBucketService();
      const result = await service.checkLimit({ key, capacity, refillPerSec });

      incrementTotal();

      // Attach rate-limit headers regardless of allow/deny
      res.set({
        'X-RateLimit-Limit':     String(capacity),
        'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
        'X-RateLimit-Policy':    `${capacity};w=${Math.ceil(capacity / refillPerSec)}`,
      });

      if (!result.allowed) {
        incrementDenied();
        logger.warn('RateLimiter', 'Request denied', { key, remaining: result.remaining });
        res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
        res.status(429).json({
          error:          'Too Many Requests',
          retry_after_ms: result.retryAfterMs,
        });
        return;
      }

      incrementAllowed();
      next();
    } catch (err: unknown) {
      // Unexpected error (not a Redis failure — those are caught inside the service)
      logger.error('RateLimiter', 'Unexpected error', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  };
}
