import { BucketRepository } from '../../src/repositories/bucket.repository';

function makeMockRedis(evalshaImpl?: jest.Mock) {
  return {
    call:     jest.fn().mockResolvedValue('abc123sha'),
    evalsha:  evalshaImpl ?? jest.fn().mockResolvedValue([1, 9, 0]),
  };
}

describe('BucketRepository.checkAndConsume', () => {
  it('returns allowed=true when Lua script returns [1, remaining, 0]', async () => {
    const redis = makeMockRedis(jest.fn().mockResolvedValue([1, 9, 0]));
    const repo = new BucketRepository(redis as any);

    const result = await repo.checkAndConsume({ key: 'user:1', capacity: 10, refillPerSec: 1 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfterMs).toBe(0);
  });

  it('returns allowed=false when Lua script returns [0, 0, retryMs]', async () => {
    const redis = makeMockRedis(jest.fn().mockResolvedValue([0, 0, 850]));
    const repo = new BucketRepository(redis as any);

    const result = await repo.checkAndConsume({ key: 'user:2', capacity: 10, refillPerSec: 1 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBe(850);
  });

  it('loads the Lua script via SCRIPT LOAD on first call', async () => {
    const redis = makeMockRedis();
    const repo = new BucketRepository(redis as any);

    await repo.checkAndConsume({ key: 'test', capacity: 5, refillPerSec: 1 });

    expect(redis.call).toHaveBeenCalledWith('SCRIPT', 'LOAD', expect.any(String));
  });

  it('reuses SHA on subsequent calls (SCRIPT LOAD called only once)', async () => {
    const redis = makeMockRedis();
    const repo = new BucketRepository(redis as any);

    await repo.checkAndConsume({ key: 'test', capacity: 5, refillPerSec: 1 });
    await repo.checkAndConsume({ key: 'test', capacity: 5, refillPerSec: 1 });
    await repo.checkAndConsume({ key: 'test', capacity: 5, refillPerSec: 1 });

    expect(redis.call).toHaveBeenCalledTimes(1);
  });

  it('reloads script and retries on NOSCRIPT error', async () => {
    let callCount = 0;
    const evalsha = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('NOSCRIPT No matching script. Please use EVAL.');
      return [1, 5, 0];
    });

    const redis = makeMockRedis(evalsha);
    const repo = new BucketRepository(redis as any);

    const result = await repo.checkAndConsume({ key: 'test', capacity: 10, refillPerSec: 1 });

    expect(result.allowed).toBe(true);
    // SCRIPT LOAD called twice: initial load + reload after NOSCRIPT
    expect(redis.call).toHaveBeenCalledTimes(2);
    expect(evalsha).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries on persistent NOSCRIPT', async () => {
    const evalsha = jest.fn().mockRejectedValue(new Error('NOSCRIPT No matching script.'));
    const redis = makeMockRedis(evalsha);
    const repo = new BucketRepository(redis as any);

    await expect(
      repo.checkAndConsume({ key: 'test', capacity: 10, refillPerSec: 1 })
    ).rejects.toThrow('NOSCRIPT');
  });

  it('propagates non-NOSCRIPT errors immediately', async () => {
    const evalsha = jest.fn().mockRejectedValue(new Error('WRONGTYPE Operation'));
    const redis = makeMockRedis(evalsha);
    const repo = new BucketRepository(redis as any);

    await expect(
      repo.checkAndConsume({ key: 'test', capacity: 10, refillPerSec: 1 })
    ).rejects.toThrow('WRONGTYPE Operation');

    // Should not retry on non-NOSCRIPT errors
    expect(evalsha).toHaveBeenCalledTimes(1);
  });

  it('prefixes Redis key with "bucket:"', async () => {
    const evalsha = jest.fn().mockResolvedValue([1, 4, 0]);
    const redis = makeMockRedis(evalsha);
    const repo = new BucketRepository(redis as any);

    await repo.checkAndConsume({ key: 'user:42', capacity: 5, refillPerSec: 1 });

    expect(evalsha).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'bucket:user:42',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });
});
