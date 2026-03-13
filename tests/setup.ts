/**
 * Jest global setup — runs before any test file is loaded.
 * Sets env vars so dotenv in env.ts does not override them.
 */

process.env.NODE_ENV              = 'test';
process.env.LOG_LEVEL             = 'error'; // silence logs during tests

// Redis — override with CI env if present
process.env.REDIS_HOST            = process.env.REDIS_HOST ?? 'localhost';
process.env.REDIS_PORT            = process.env.REDIS_PORT ?? '6379';

// PostgreSQL
process.env.DB_HOST               = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT               = process.env.DB_PORT ?? '5432';
process.env.DB_NAME               = process.env.DB_NAME ?? 'rate_limiter_test';
process.env.DB_USER               = process.env.DB_USER ?? 'postgres';
process.env.DB_PASSWORD           = process.env.DB_PASSWORD ?? 'postgres';

// Rate limiter — use small values for fast tests
process.env.RATE_LIMIT_ENABLED            = 'true';
process.env.RATE_LIMIT_CAPACITY           = '5';
process.env.RATE_LIMIT_REFILL_PER_SEC     = '1';
process.env.RATE_LIMIT_FAIL_POLICY        = 'open';
process.env.RATE_LIMIT_LOCAL_CACHE_ENABLED = 'false';
