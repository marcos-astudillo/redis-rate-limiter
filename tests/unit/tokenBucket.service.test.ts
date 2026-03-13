import { TokenBucketService } from '../../src/services/tokenBucket.service';
import { BucketRepository } from '../../src/repositories/bucket.repository';
import { RateLimiterConfig } from '../../src/models/rateLimit.types';

const baseConfig: RateLimiterConfig = {
  capacity:          10,
  refillPerSec:      1,
  failPolicy:        'open',
  localCacheEnabled: false,
  localCacheTtlMs:   500,
};

function makeService(config: Partial<RateLimiterConfig>, mockRepo: Partial<BucketRepository>) {
  return new TokenBucketService(mockRepo as BucketRepository, { ...baseConfig, ...config });
}

describe('TokenBucketService', () => {
  describe('checkLimit', () => {
    it('returns allowed result from the repository', async () => {
      const mockRepo = {
        checkAndConsume: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 }),
      };
      const service = makeService({}, mockRepo);

      const result = await service.checkLimit({ key: 'user:1', capacity: 10, refillPerSec: 1 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(mockRepo.checkAndConsume).toHaveBeenCalledTimes(1);
    });

    it('returns denied result from the repository', async () => {
      const mockRepo = {
        checkAndConsume: jest.fn().mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 800 }),
      };
      const service = makeService({}, mockRepo);

      const result = await service.checkLimit({ key: 'user:2', capacity: 10, refillPerSec: 1 });

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(800);
    });
  });

  describe('fail policy', () => {
    it('fail-open: allows when Redis errors', async () => {
      const mockRepo = {
        checkAndConsume: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const service = makeService({ failPolicy: 'open' }, mockRepo);

      const result = await service.checkLimit({ key: 'test', capacity: 10, refillPerSec: 1 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1); // sentinel: degraded mode
    });

    it('fail-closed: denies when Redis errors', async () => {
      const mockRepo = {
        checkAndConsume: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const service = makeService({ failPolicy: 'closed' }, mockRepo);

      const result = await service.checkLimit({ key: 'test', capacity: 10, refillPerSec: 1 });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('local cache', () => {
    it('serves cached result on second call without hitting Redis', async () => {
      const mockRepo = {
        checkAndConsume: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 }),
      };
      const service = makeService({ localCacheEnabled: true, localCacheTtlMs: 5000 }, mockRepo);
      const opts = { key: 'cached:user', capacity: 10, refillPerSec: 1 };

      await service.checkLimit(opts);
      await service.checkLimit(opts);

      // Second call should be served from cache — repo called only once
      expect(mockRepo.checkAndConsume).toHaveBeenCalledTimes(1);
    });

    it('does not cache when remaining is below 20% of capacity', async () => {
      // remaining=1, capacity=10 → 10% → below threshold → no cache
      const mockRepo = {
        checkAndConsume: jest.fn().mockResolvedValue({ allowed: true, remaining: 1, retryAfterMs: 0 }),
      };
      const service = makeService({ localCacheEnabled: true, localCacheTtlMs: 5000 }, mockRepo);
      const opts = { key: 'low:user', capacity: 10, refillPerSec: 1 };

      await service.checkLimit(opts);
      await service.checkLimit(opts);

      // Both calls go to Redis because remaining is too low to cache
      expect(mockRepo.checkAndConsume).toHaveBeenCalledTimes(2);
    });
  });
});
