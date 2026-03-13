# Redis Rate Limiter

A production-grade **distributed rate limiter** built with Node.js, TypeScript, Redis, and PostgreSQL.

Implements the **Token Bucket** algorithm with **atomic Redis Lua scripts** — no race conditions under concurrent load.

> System design reference: [rate-limiter.md](https://github.com/marcos-astudillo/system-design-notes/blob/main/designs/rate-limiter.md)

---

## Features

- **Token Bucket algorithm** — supports burst traffic, configurable refill rate
- **Atomic Redis Lua script** — correct under concurrency, single round-trip per request
- **EVALSHA caching** — script SHA cached in Redis, automatic reload on eviction
- **Fail-open / fail-closed** — configurable degradation policy when Redis is unavailable
- **Local in-memory cache** — optional fast-path to skip Redis for keys clearly under limit
- **Pluggable key extraction** — by API key, user ID, IP, or custom strategy
- **Plan-based policies** — free / pro / enterprise limits stored in PostgreSQL
- **Standard headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- **Dual interface** — use as Express middleware or standalone HTTP microservice

---

## Architecture

```
Client
  │
  ▼
API Gateway / Edge
  │
  ▼
Express App
  ├── POST /v1/ratelimit/check  ← microservice API
  ├── GET  /v1/policies         ← plan policy CRUD
  └── GET  /v1/metrics          ← operational metrics
  │
  ├── rateLimiter() middleware  ← SDK-style for internal routes
  │
  ├── TokenBucketService
  │     ├── LocalCache (optional, in-process)
  │     └── BucketRepository
  │           └── Redis Lua Script (EVALSHA)
  │                 └── Redis Cluster ────► bucket:<key> { tokens, last_refill_ms }
  │
  └── PolicyRepository
        └── PostgreSQL ──────────────────► rate_limit_policies { name, capacity, refill_per_sec }
```

### Lua script (atomic token bucket)

```
1. HMGET bucket state (tokens, last_refill_ms)
2. Compute elapsed seconds since last refill
3. tokens = min(capacity, tokens + elapsed × refillPerSec)
4. if tokens ≥ 1 → tokens -= 1, allowed = true
5. else → compute retry_after_ms, allowed = false
6. HSET updated state + EXPIRE
7. Return [allowed, remaining, retry_after_ms]
```

---

## API Endpoints

### Rate Limit Check

```
POST /v1/ratelimit/check
```

**Request:**
```json
{
  "key":           "user:123|route:/v1/orders",
  "capacity":      100,
  "refill_per_sec": 1.0
}
```

**Response 200 (allowed):**
```json
{ "allowed": true, "remaining": 42, "retry_after_ms": 0 }
```

**Response 429 (denied):**
```json
{ "allowed": false, "remaining": 0, "retry_after_ms": 850 }
```

**Headers (always):**
```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 42
X-RateLimit-Policy:    100;w=100
Retry-After:           1        (on 429 only)
```

---

### Policy Management

| Method | Endpoint             | Description           |
|--------|----------------------|-----------------------|
| GET    | /v1/policies         | List all plans        |
| GET    | /v1/policies/:name   | Get a plan            |
| POST   | /v1/policies         | Create a plan         |
| PATCH  | /v1/policies/:name   | Update a plan         |
| DELETE | /v1/policies/:name   | Delete a plan         |

**Create policy:**
```json
{ "name": "pro", "capacity": 100, "refill_per_sec": 1.67 }
```

---

### Other

| Method | Endpoint    | Description                     |
|--------|-------------|---------------------------------|
| GET    | /health     | Health check                    |
| GET    | /v1/metrics | Request counters + Redis status |

---

## Middleware Usage (SDK-style)

```typescript
import { rateLimiter } from './middlewares/rateLimiter';
import { byIpAndRoute } from './services/keyExtractor';

// Global — defaults from env
app.use(rateLimiter());

// Per-route — custom limits
router.post('/orders', rateLimiter({ capacity: 50, refillPerSec: 5 }), handler);

// Per-route — custom key strategy
router.get('/search', rateLimiter({ keyExtractor: byIpAndRoute, capacity: 20 }), handler);
```

---

## Feature Flags

| Variable                        | Default  | Description                                      |
|---------------------------------|----------|--------------------------------------------------|
| `RATE_LIMIT_ENABLED`            | `true`   | Global on/off switch                             |
| `RATE_LIMIT_CAPACITY`           | `100`    | Default bucket capacity (max burst)              |
| `RATE_LIMIT_REFILL_PER_SEC`     | `10`     | Default token refill rate                        |
| `RATE_LIMIT_FAIL_POLICY`        | `open`   | `open` = allow on Redis failure, `closed` = deny |
| `RATE_LIMIT_LOCAL_CACHE_ENABLED`| `false`  | In-memory cache to skip Redis round-trips        |
| `RATE_LIMIT_LOCAL_CACHE_TTL_MS` | `500`    | Local cache TTL in milliseconds                  |

---

## Run Locally

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Steps

```bash
# 1. Clone and install
git clone https://github.com/marcos-astudillo/redis-rate-limiter.git
cd redis-rate-limiter
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start Redis and PostgreSQL
docker compose up redis postgres -d

# 4. Run database migration
npm run migrate

# 5. Start dev server (hot-reload)
npm run dev
```

The server starts at `http://localhost:3000`.

```bash
# Quick smoke test
curl -s -X POST http://localhost:3000/v1/ratelimit/check \
  -H "Content-Type: application/json" \
  -d '{"key":"user:1","capacity":10,"refill_per_sec":1}' | jq
```

---

## Run with Docker

```bash
# Build and start all services (Redis + Postgres + App)
docker compose up --build

# Run migration inside the app container
docker compose exec app node dist/index.js  # (migration runs on startup)
# Or run separately:
docker compose exec app npm run migrate
```

---

## Tests

```bash
# Run all tests (requires Redis running on localhost:6379)
npm test

# Unit tests only (no Redis required)
npx jest tests/unit

# With coverage
npm run test:coverage
```

Integration tests flush a dedicated Redis DB between each test — they are safe to run against your local dev Redis.

---

## Project Structure

```
src/
├── config/
│   ├── env.ts          # Typed env vars
│   ├── redis.ts        # Redis singleton client
│   ├── database.ts     # PostgreSQL pool
│   └── logger.ts       # Structured JSON logger
├── controllers/
│   ├── ratelimit.controller.ts
│   ├── policy.controller.ts
│   └── metrics.controller.ts
├── middlewares/
│   ├── rateLimiter.ts  # Express middleware factory
│   ├── requestLogger.ts
│   └── errorHandler.ts
├── routes/
│   ├── ratelimit.routes.ts
│   ├── policy.routes.ts
│   └── metrics.routes.ts
├── services/
│   ├── tokenBucket.service.ts  # Core business logic + fail policy
│   ├── localCache.ts           # In-memory TTL cache
│   ├── keyExtractor.ts         # Key strategies (IP, API key, user)
│   ├── policy.service.ts
│   └── metrics.service.ts
├── repositories/
│   ├── bucket.repository.ts    # Redis EVALSHA
│   └── policy.repository.ts    # PostgreSQL CRUD
├── scripts/
│   └── tokenBucket.ts          # Lua script as TS constant
└── models/
    ├── rateLimit.types.ts
    └── policy.types.ts
```

---

## Scaling Considerations

| Concern | Approach |
|---|---|
| Redis is single point of failure | Use Redis Cluster or Redis Sentinel for HA |
| Hot keys (one user spamming) | One Redis shard handles the key — monitor shard CPU; add key salt if needed |
| 50k QPS target | Redis can handle ~100k ops/sec per shard; one Lua call per request |
| Clock skew across app instances | Timestamps stored in Redis (server time), not app instance time |
| Reducing Redis load | Enable `RATE_LIMIT_LOCAL_CACHE_ENABLED=true` with a short TTL |
| Multi-region | Hierarchical approach: local per-region limiter + global Redis aggregator |
| Dynamic policy updates | Update `rate_limit_policies` table via API; middleware reads from PostgreSQL on miss |

---

## CI/CD

GitHub Actions runs on every push and PR to `main`:

1. **Typecheck** — `tsc --noEmit`
2. **Lint** — ESLint with `@typescript-eslint`
3. **Test** — Jest with real Redis and PostgreSQL services
4. **Build** — `tsc` compile to `dist/`

Deploy to **Railway**: connect the GitHub repo, set env vars from `.env.example`, and Railway will build the Dockerfile automatically.
