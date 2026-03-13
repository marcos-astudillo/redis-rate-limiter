import request from 'supertest';
import { createApp } from '../../src/app';
import { getRedisClient, closeRedisClient } from '../../src/config/redis';
import { _resetTokenBucketService } from '../../src/services/tokenBucket.service';

const app = createApp();

// Capacity is set to 5 in tests/setup.ts
const BASE_PAYLOAD = { key: 'test:user:1', capacity: 5, refill_per_sec: 1 };

beforeEach(async () => {
  // Flush Redis between tests to isolate bucket state
  await getRedisClient().flushdb();
  // Reset service singleton so it picks up any env changes
  _resetTokenBucketService();
});

afterAll(async () => {
  await closeRedisClient();
});

describe('POST /v1/ratelimit/check', () => {
  it('returns 200 and allowed=true on first request', async () => {
    const res = await request(app)
      .post('/v1/ratelimit/check')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.remaining).toBe(4); // 5 - 1
  });

  it('decrements remaining on each request', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/v1/ratelimit/check').send(BASE_PAYLOAD);
    }
    const res = await request(app).post('/v1/ratelimit/check').send(BASE_PAYLOAD);
    expect(res.body.remaining).toBe(1);
  });

  it('returns 429 after capacity is exhausted', async () => {
    const payload = { ...BASE_PAYLOAD, key: 'test:throttle' };
    for (let i = 0; i < 5; i++) {
      await request(app).post('/v1/ratelimit/check').send(payload);
    }

    const res = await request(app).post('/v1/ratelimit/check').send(payload);

    expect(res.status).toBe(429);
    expect(res.body.allowed).toBe(false);
    expect(res.body.remaining).toBe(0);
    expect(res.body.retry_after_ms).toBeGreaterThan(0);
  });

  it('includes X-RateLimit headers on every response', async () => {
    const res = await request(app)
      .post('/v1/ratelimit/check')
      .send(BASE_PAYLOAD);

    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-policy']).toBeDefined();
  });

  it('includes Retry-After header on 429', async () => {
    const payload = { ...BASE_PAYLOAD, key: 'test:retry-after' };
    for (let i = 0; i < 5; i++) {
      await request(app).post('/v1/ratelimit/check').send(payload);
    }
    const res = await request(app).post('/v1/ratelimit/check').send(payload);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('isolates buckets by key', async () => {
    // Exhaust one key, the other should still be allowed
    for (let i = 0; i < 5; i++) {
      await request(app).post('/v1/ratelimit/check').send({ ...BASE_PAYLOAD, key: 'test:key-a' });
    }

    const resA = await request(app).post('/v1/ratelimit/check').send({ ...BASE_PAYLOAD, key: 'test:key-a' });
    const resB = await request(app).post('/v1/ratelimit/check').send({ ...BASE_PAYLOAD, key: 'test:key-b' });

    expect(resA.status).toBe(429);
    expect(resB.status).toBe(200);
  });
});

describe('POST /v1/ratelimit/check — validation', () => {
  it('returns 400 when key is missing', async () => {
    const res = await request(app)
      .post('/v1/ratelimit/check')
      .send({ capacity: 10, refill_per_sec: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when capacity is not a number', async () => {
    const res = await request(app)
      .post('/v1/ratelimit/check')
      .send({ key: 'test', capacity: 'bad', refill_per_sec: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when refill_per_sec is zero', async () => {
    const res = await request(app)
      .post('/v1/ratelimit/check')
      .send({ key: 'test', capacity: 10, refill_per_sec: 0 });
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /v1/metrics', () => {
  it('returns metrics object', async () => {
    const res = await request(app).get('/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRequests');
    expect(res.body).toHaveProperty('allowedRequests');
    expect(res.body).toHaveProperty('deniedRequests');
    expect(res.body).toHaveProperty('redis');
  });
});
