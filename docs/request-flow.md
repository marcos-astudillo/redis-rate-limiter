# Request Flow Diagrams

---

## A) Standalone Microservice — `POST /v1/ratelimit/check`

```mermaid
sequenceDiagram
    participant Client as Client App
    participant API as Express /v1/ratelimit/check
    participant MW as rateLimiter() middleware
    participant Cache as LocalCache (optional)
    participant TB as TokenBucketService
    participant Repo as BucketRepository
    participant Redis as Redis (Lua script)

    Client->>API: POST /v1/ratelimit/check { key, capacity, refill_per_sec }
    API->>MW: apply rate limit

    MW->>Cache: get(key)

    alt Cache hit — clearly under limit
        Cache-->>MW: remaining tokens
        MW-->>Client: 200 allowed=true (no Redis call)
    else Cache miss
        MW->>TB: checkLimit(key, capacity, refillPerSec)
        TB->>Repo: checkAndConsume(options)
        Repo->>Redis: EVALSHA token_bucket_script
        Redis-->>Repo: [allowed, remaining, retryAfterMs]
        Repo-->>TB: RateLimitResult
        TB-->>MW: RateLimitResult

        alt allowed = true
            MW->>Cache: set(key, remaining)
            MW-->>Client: 200 { allowed: true, remaining, retry_after_ms: 0 }
        else allowed = false
            MW-->>Client: 429 { allowed: false, retry_after_ms } + Retry-After header
        end
    end
```

---

## B) Plan-aware Middleware — `rateLimiterByPlan()`

```mermaid
sequenceDiagram
    participant Client as Client
    participant MW as rateLimiterByPlan()
    participant PC as policyCache (LocalCache<Policy> 60s)
    participant DB as PolicyRepository (PostgreSQL)
    participant TB as TokenBucketService
    participant Redis as Redis

    Client->>MW: incoming request

    MW->>MW: getPlan(req) → e.g. "pro"
    MW->>PC: get("pro")

    alt Policy cache hit (< 60s old)
        PC-->>MW: { capacity: 100, refillPerSec: 1.67 }
    else Policy cache miss
        MW->>DB: findByName("pro")
        alt Plan found
            DB-->>MW: RateLimitPolicy
            MW->>PC: set("pro", policy)
        else Plan not found + fallback configured
            MW-->>MW: use fallback limits
        else Plan not found + no fallback
            MW-->>Client: 500 Policy not configured
        end
    end

    MW->>TB: checkLimit({ key, capacity, refillPerSec })
    TB->>Redis: EVALSHA token_bucket_script
    Redis-->>TB: [allowed, remaining, retryAfterMs]
    TB-->>MW: RateLimitResult

    alt allowed = true
        MW-->>Client: next() + X-RateLimit-Plan: pro
    else allowed = false
        MW-->>Client: 429 + Retry-After
    end
```

---

## C) Redis fail policy — what happens when Redis is down

```mermaid
sequenceDiagram
    participant MW as rateLimiter() middleware
    participant TB as TokenBucketService
    participant Repo as BucketRepository
    participant Redis as Redis (unavailable)
    participant Metrics as MetricsService

    MW->>TB: checkLimit(options)
    TB->>Repo: checkAndConsume(options)
    Repo->>Redis: EVALSHA
    Redis--xRepo: connection error

    Repo-->>TB: throws Error
    TB->>Metrics: incrementRedisErrors()

    alt RATE_LIMIT_FAIL_POLICY = open
        TB-->>MW: { allowed: true, remaining: -1, retryAfterMs: 0 }
        MW-->>MW: set X-RateLimit-Remaining: -1 (signals degraded state)
        MW-->>MW: next() — request passes through
    else RATE_LIMIT_FAIL_POLICY = closed
        TB-->>MW: { allowed: false, remaining: 0, retryAfterMs: -1 }
        MW-->>MW: 429 — request rejected to protect backend
    end
```

---

## D) Startup — `bootstrap()`

```mermaid
sequenceDiagram
    participant Node as Node.js process
    participant Boot as bootstrap()
    participant DB as database.ts (runMigration)
    participant PG as PostgreSQL
    participant Redis as Redis
    participant App as Express App

    Node->>Boot: start

    Boot->>DB: runMigration()
    DB->>DB: read scripts/schema.sql
    DB->>PG: CREATE TABLE IF NOT EXISTS ...
    DB->>PG: INSERT plans ON CONFLICT DO NOTHING
    PG-->>DB: ok
    DB-->>Boot: migration complete

    Boot->>Redis: getRedisClient() (eager connect)
    Redis-->>Boot: connected

    Boot->>App: createApp()
    Boot->>App: app.listen(PORT)
    App-->>Node: listening on PORT

    Note over Boot: SIGTERM / SIGINT → graceful shutdown
```
