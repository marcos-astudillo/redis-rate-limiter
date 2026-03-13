import { Request, Response, NextFunction } from 'express';
import { getPolicyService } from '../services/policy.service';
import { getTokenBucketService } from '../services/tokenBucket.service';
import { KeyExtractor, byApiKeyOrUser } from '../services/keyExtractor';
import { LocalCache } from '../services/localCache';
import { RateLimitPolicy } from '../models/policy.types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { incrementAllowed, incrementDenied, incrementTotal } from '../services/metrics.service';

export interface PlanRateLimiterOptions {
  /**
   * Resolve the plan name from the request.
   * Examples:
   *   getPlan: (req) => req.user?.plan ?? 'free'
   *   getPlan: (req) => req.headers['x-plan'] as string ?? 'free'
   */
  getPlan: (req: Request) => string | Promise<string>;

  /**
   * Fallback limits when the plan is not found in PostgreSQL.
   * If omitted, a missing plan causes a 500 error.
   */
  fallback?: { capacity: number; refillPerSec: number };

  /** Custom key extraction strategy. Defaults to byApiKeyOrUser. */
  keyExtractor?: KeyExtractor;
}

/**
 * Policy cache — shared across all rateLimiterByPlan() instances.
 * TTL of 60s means policy changes propagate within one minute.
 */
const policyCache = new LocalCache<RateLimitPolicy>(60_000);

/**
 * rateLimiterByPlan() — plan-aware rate limiter middleware.
 *
 * Bridges PostgreSQL (plan policies) with Redis (token buckets):
 *   1. Resolve plan name from the request
 *   2. Look up capacity + refill_per_sec from the policies table (cached 60s)
 *   3. Apply token bucket rate limiting with those limits
 *
 * Usage:
 *   // User has req.user.plan set by upstream auth middleware
 *   router.post('/orders',
 *     rateLimiterByPlan({ getPlan: (req) => req.user?.plan ?? 'free' }),
 *     handler
 *   )
 *
 *   // All routes use the 'pro' plan
 *   app.use(rateLimiterByPlan({ getPlan: () => 'pro' }))
 *
 *   // With fallback if DB is down
 *   rateLimiterByPlan({
 *     getPlan: (req) => req.user?.plan ?? 'free',
 *     fallback: { capacity: 20, refillPerSec: 0.33 },
 *   })
 */
export function rateLimiterByPlan(options: PlanRateLimiterOptions) {
  const extract = options.keyExtractor ?? byApiKeyOrUser;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!env.rateLimit.enabled) {
      next();
      return;
    }

    try {
      const planName = await options.getPlan(req);
      const policy = await resolvePolicy(planName, options.fallback);

      if (!policy) {
        logger.warn('RateLimiterByPlan', 'Policy not found and no fallback configured', { planName });
        res.status(500).json({ error: `Rate limit policy '${planName}' not configured` });
        return;
      }

      const key = extract(req);
      const service = getTokenBucketService();
      const result = await service.checkLimit({
        key,
        capacity:     policy.capacity,
        refillPerSec: policy.refillPerSec,
      });

      incrementTotal();

      res.set({
        'X-RateLimit-Limit':     String(policy.capacity),
        'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
        'X-RateLimit-Policy':    `${policy.capacity};w=${Math.ceil(policy.capacity / policy.refillPerSec)}`,
        'X-RateLimit-Plan':      planName,
      });

      if (!result.allowed) {
        incrementDenied();
        logger.warn('RateLimiterByPlan', 'Request denied', { key, planName, remaining: result.remaining });
        res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
        res.status(429).json({
          error:          'Too Many Requests',
          plan:           planName,
          retry_after_ms: result.retryAfterMs,
        });
        return;
      }

      incrementAllowed();
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function resolvePolicy(
  planName: string,
  fallback?: { capacity: number; refillPerSec: number },
): Promise<RateLimitPolicy | null> {
  // 1. Local in-process cache (60s TTL) — avoids PostgreSQL hit on every request
  const cached = policyCache.get(planName);
  if (cached !== undefined) {
    logger.debug('RateLimiterByPlan', 'Policy cache hit', { planName });
    return cached;
  }

  // 2. PostgreSQL lookup
  try {
    const policy = await getPolicyService().getPolicy(planName);
    policyCache.set(planName, policy);
    logger.debug('RateLimiterByPlan', 'Policy loaded from DB', { planName, capacity: policy.capacity });
    return policy;
  } catch {
    logger.warn('RateLimiterByPlan', 'Policy not found in DB', { planName });

    // 3. Fallback (don't cache — allows DB recovery without restart)
    if (fallback) {
      return {
        id:           -1,
        name:         planName,
        capacity:     fallback.capacity,
        refillPerSec: fallback.refillPerSec,
        createdAt:    new Date(),
        updatedAt:    new Date(),
      };
    }

    return null;
  }
}

/** Invalidate a cached policy — call after updating a policy via the API */
export function invalidatePolicyCache(planName: string): void {
  policyCache.delete(planName);
}
