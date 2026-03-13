# Architecture Diagram

System architecture of the Redis Rate Limiter service.

```mermaid
graph TB
    subgraph Clients["🌐 Clients"]
        C1[Any HTTP Client]
        C2[External Service<br/>Node / Python / Go]
    end

    subgraph Railway["☁️ Railway"]
        subgraph App["Express App — Node.js + TypeScript"]
            direction TB

            subgraph Routes["Routes /v1"]
                R1["POST /v1/ratelimit/check"]
                R2["CRUD /v1/policies"]
                R3["GET  /v1/metrics"]
                R4["GET  /api-docs"]
                R5["GET  /health"]
            end

            subgraph Middlewares["Middlewares"]
                MW1["rateLimiter()\nstatic limits per route"]
                MW2["rateLimiterByPlan()\ndynamic limits from DB"]
                MW3["requestLogger()"]
                MW4["errorHandler()"]
            end

            subgraph Services["Services"]
                SV1["TokenBucketService\nfail-open / fail-closed\neviction timer 60s"]
                SV2["PolicyService\nplan CRUD"]
                SV3["MetricsService\nin-process counters"]
                SV4["KeyExtractor\nbyIp · byApiKey\nbyUser · byIpAndRoute"]
                SV5["LocalCache‹number›\nTTL fast-path\nskip Redis"]
                SV6["LocalCache‹Policy›\n60s policy cache\nskip PostgreSQL"]
            end

            subgraph Repositories["Repositories"]
                RP1["BucketRepository\nEVALSHA\nNOSCRIPT guard"]
                RP2["PolicyRepository\nPostgreSQL CRUD"]
            end

            subgraph Scripts["Scripts"]
                LUA["Lua Token Bucket\n1. HMGET state\n2. Refill tokens\n3. Consume 1 token\n4. HSET + EXPIRE\n5. Return result"]
            end
        end

        subgraph Infra["Infrastructure"]
            REDIS[("Redis\nbucket:key\ntokens + last_refill_ms")]
            PG[("PostgreSQL\nrate_limit_policies\nname · capacity · refill_per_sec")]
        end
    end

    subgraph Startup["🚀 Startup — bootstrap()"]
        MIG["runMigration()\nschema.sql\nIF NOT EXISTS"]
    end

    %% Client connections
    C1 -->|"HTTP POST /v1/ratelimit/check"| R1
    C2 -->|"HTTP"| R1

    %% Routes to middlewares / services
    R1 --> MW1
    R1 --> MW2
    R2 --> SV2
    R3 --> SV3
    R4 -->|"Swagger UI\nOpenAPI 3.0"| Routes

    %% Middlewares to services
    MW1 --> SV4
    MW1 --> SV1
    MW2 --> SV4
    MW2 --> SV6
    MW2 --> SV1

    %% Services to repositories
    SV1 --> SV5
    SV1 --> RP1
    SV2 --> RP2
    SV6 -->|"cache miss"| RP2

    %% Repositories to infrastructure
    RP1 --> LUA
    LUA -->|"EVALSHA atomic"| REDIS
    RP2 --> PG

    %% Startup migration
    MIG --> PG

    %% Styling
    classDef infra fill:#1a1a2e,color:#e0e0e0,stroke:#4a90d9
    classDef service fill:#16213e,color:#e0e0e0,stroke:#4a90d9
    classDef cache fill:#0f3460,color:#e0e0e0,stroke:#e94560
    classDef lua fill:#533483,color:#e0e0e0,stroke:#e94560
    classDef client fill:#2d2d2d,color:#e0e0e0,stroke:#888

    class REDIS,PG infra
    class SV1,SV2,SV3,SV4 service
    class SV5,SV6 cache
    class LUA lua
    class C1,C2 client
```

---

## Request Flow

### A) Standalone microservice (external HTTP call)

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
    alt Cache hit (clearly under limit)
        Cache-->>MW: remaining tokens
        MW-->>Client: 200 allowed=true (no Redis call)
    else Cache miss
        MW->>TB: checkLimit(key, capacity, refillPerSec)
        TB->>Repo: checkAndConsume(options)
        Repo->>Redis: EVALSHA token_bucket_script
        Redis-->>Repo: [allowed, remaining, retryAfterMs]
        Repo-->>TB: RateLimitResult
        TB-->>MW: RateLimitResult
        alt allowed
            MW-->>Client: 200 { allowed: true, remaining, retry_after_ms: 0 }
        else denied
            MW-->>Client: 429 { allowed: false, retry_after_ms }
        end
    end
```

---

### B) Plan-aware middleware (rateLimiterByPlan)

```mermaid
sequenceDiagram
    participant Client as Client
    participant MW as rateLimiterByPlan()
    participant PC as policyCache (LocalCache<Policy>)
    participant DB as PolicyRepository (PostgreSQL)
    participant TB as TokenBucketService
    participant Redis as Redis

    Client->>MW: incoming request
    MW->>MW: getPlan(req) → "pro"
    MW->>PC: get("pro")
    alt Policy cache hit (< 60s old)
        PC-->>MW: { capacity: 100, refillPerSec: 1.67 }
    else Policy cache miss
        MW->>DB: findByName("pro")
        DB-->>MW: RateLimitPolicy
        MW->>PC: set("pro", policy)
    end
    MW->>TB: checkLimit({ key, capacity, refillPerSec })
    TB->>Redis: EVALSHA
    Redis-->>TB: [allowed, remaining, retryAfterMs]
    TB-->>MW: RateLimitResult
    alt allowed
        MW-->>Client: next() + X-RateLimit-Plan: pro
    else denied
        MW-->>Client: 429 + Retry-After
    end
```

---

## Data Model

```mermaid
erDiagram
    RATE_LIMIT_POLICIES {
        serial      id              PK
        varchar64   name            UK  "free | pro | enterprise"
        integer     capacity            "max tokens (burst size)"
        numeric     refill_per_sec      "tokens added per second"
        timestamptz created_at
        timestamptz updated_at
    }
```

**Redis key structure:**

```
bucket:<key>
  tokens         float   "current token count"
  last_refill_ms int     "Unix timestamp of last refill (ms)"

TTL = ceil((capacity / refillPerSec) * 2) seconds
```
