import { Request, Response, NextFunction } from 'express';
import { getTokenBucketService } from '../services/tokenBucket.service';
import { RateLimitOptions } from '../models/rateLimit.types';
import { incrementAllowed, incrementDenied, incrementTotal } from '../services/metrics.service';

/**
 * POST /v1/ratelimit/check
 *
 * Body: { key: string, capacity: number, refill_per_sec: number }
 * Response 200: { allowed: true,  remaining: number, retry_after_ms: 0 }
 * Response 429: { allowed: false, remaining: 0,      retry_after_ms: number }
 */
export async function checkLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { key, capacity, refill_per_sec } = req.body as Record<string, unknown>;

    const errors: string[] = [];
    if (!key || typeof key !== 'string')                        errors.push('key must be a non-empty string');
    if (typeof capacity !== 'number' || capacity <= 0)          errors.push('capacity must be a positive number');
    if (typeof refill_per_sec !== 'number' || refill_per_sec <= 0) errors.push('refill_per_sec must be a positive number');

    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const options: RateLimitOptions = {
      key:          key as string,
      capacity:     capacity as number,
      refillPerSec: refill_per_sec as number,
    };

    const service = getTokenBucketService();
    const result = await service.checkLimit(options);

    incrementTotal();

    // Standard rate-limit response headers (draft-ietf-httpapi-ratelimit-headers)
    res.set({
      'X-RateLimit-Limit':     String(capacity),
      'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
      'X-RateLimit-Policy':    `${capacity};w=${Math.ceil((capacity as number) / (refill_per_sec as number))}`,
    });

    if (!result.allowed) {
      incrementDenied();
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({
        allowed:        false,
        remaining:      result.remaining,
        retry_after_ms: result.retryAfterMs,
      });
      return;
    }

    incrementAllowed();
    res.json({ allowed: true, remaining: result.remaining, retry_after_ms: 0 });
  } catch (err) {
    next(err);
  }
}
