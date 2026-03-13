import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/app';
import { getDbPool, closeDbPool } from '../../src/config/database';

const app = createApp();

// Run the idempotent migration before any test in this file
beforeAll(async () => {
  const pool = getDbPool();
  const sql = fs.readFileSync(path.join(__dirname, '../../scripts/schema.sql'), 'utf8');
  await pool.query(sql);
});

// Isolate test data using a "test:" prefix — never touches seeded plans
async function cleanTestPolicies(): Promise<void> {
  await getDbPool().query("DELETE FROM rate_limit_policies WHERE name LIKE 'test:%'");
}

beforeEach(cleanTestPolicies);
afterAll(async () => {
  await cleanTestPolicies();
  await closeDbPool();
});

// ─── GET /v1/policies ─────────────────────────────────────────────────────────

describe('GET /v1/policies', () => {
  it('returns 200 with an array', async () => {
    const res = await request(app).get('/v1/policies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('includes seeded default plans', async () => {
    const res = await request(app).get('/v1/policies');
    const names = (res.body as Array<{ name: string }>).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['free', 'pro', 'enterprise']));
  });
});

// ─── POST /v1/policies ────────────────────────────────────────────────────────

describe('POST /v1/policies', () => {
  it('creates a new policy and returns 201', async () => {
    const res = await request(app)
      .post('/v1/policies')
      .send({ name: 'test:basic', capacity: 50, refill_per_sec: 5 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('test:basic');
    expect(res.body.capacity).toBe(50);
    expect(res.body.refillPerSec).toBe(5);
    expect(res.body.id).toBeDefined();
  });

  it('returns 409 for duplicate name', async () => {
    await request(app)
      .post('/v1/policies')
      .send({ name: 'test:dup', capacity: 10, refill_per_sec: 1 });

    const res = await request(app)
      .post('/v1/policies')
      .send({ name: 'test:dup', capacity: 10, refill_per_sec: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/v1/policies')
      .send({ capacity: 10, refill_per_sec: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is negative', async () => {
    const res = await request(app)
      .post('/v1/policies')
      .send({ name: 'test:neg', capacity: -1, refill_per_sec: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when refill_per_sec is zero', async () => {
    const res = await request(app)
      .post('/v1/policies')
      .send({ name: 'test:zero', capacity: 10, refill_per_sec: 0 });
    expect(res.status).toBe(400);
  });
});

// ─── GET /v1/policies/:name ───────────────────────────────────────────────────

describe('GET /v1/policies/:name', () => {
  it('returns the policy by name', async () => {
    await request(app)
      .post('/v1/policies')
      .send({ name: 'test:getme', capacity: 20, refill_per_sec: 2 });

    const res = await request(app).get('/v1/policies/test:getme');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('test:getme');
    expect(res.body.capacity).toBe(20);
  });

  it('returns 404 for a policy that does not exist', async () => {
    const res = await request(app).get('/v1/policies/nonexistent-policy');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });
});

// ─── PATCH /v1/policies/:name ─────────────────────────────────────────────────

describe('PATCH /v1/policies/:name', () => {
  beforeEach(async () => {
    await request(app)
      .post('/v1/policies')
      .send({ name: 'test:patchme', capacity: 10, refill_per_sec: 1 });
  });

  it('updates capacity and returns the updated policy', async () => {
    const res = await request(app)
      .patch('/v1/policies/test:patchme')
      .send({ capacity: 200 });

    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(200);
    expect(res.body.refillPerSec).toBe(1); // unchanged
  });

  it('updates refill_per_sec only', async () => {
    const res = await request(app)
      .patch('/v1/policies/test:patchme')
      .send({ refill_per_sec: 9.5 });

    expect(res.status).toBe(200);
    expect(res.body.refillPerSec).toBe(9.5);
    expect(res.body.capacity).toBe(10); // unchanged
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .patch('/v1/policies/test:patchme')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is not a positive number', async () => {
    const res = await request(app)
      .patch('/v1/policies/test:patchme')
      .send({ capacity: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when patching a non-existent policy', async () => {
    const res = await request(app)
      .patch('/v1/policies/nonexistent')
      .send({ capacity: 50 });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/policies/:name ────────────────────────────────────────────────

describe('DELETE /v1/policies/:name', () => {
  it('deletes a policy and returns 204', async () => {
    await request(app)
      .post('/v1/policies')
      .send({ name: 'test:deleteme', capacity: 5, refill_per_sec: 1 });

    const deleteRes = await request(app).delete('/v1/policies/test:deleteme');
    expect(deleteRes.status).toBe(204);

    // Confirm it's gone
    const getRes = await request(app).get('/v1/policies/test:deleteme');
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent policy', async () => {
    const res = await request(app).delete('/v1/policies/nonexistent-policy');
    expect(res.status).toBe(404);
  });
});
