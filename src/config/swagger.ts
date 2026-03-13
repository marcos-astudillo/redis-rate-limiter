import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Redis Rate Limiter API',
      version,
      description: `
A distributed rate limiting service built on the **Token Bucket** algorithm.

Supports:
- Per-key rate limiting (IP, API key, user ID, route)
- Named plan policies stored in PostgreSQL (free / pro / enterprise)
- Fail-open / fail-closed policy when Redis is unavailable
- Plan-aware limiting via \`rateLimiterByPlan()\`

**Source:** [github.com/marcos-astudillo/system-design-notes](https://github.com/marcos-astudillo/system-design-notes)
      `.trim(),
      contact: {
        name: 'Backend Portfolio',
        url:  'https://github.com/marcos-astudillo',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      { url: '/v1', description: 'Current version' },
    ],
    tags: [
      { name: 'Rate Limit', description: 'Token bucket check endpoint — use as a middleware or standalone microservice' },
      { name: 'Policies',   description: 'CRUD for named rate limit plans stored in PostgreSQL' },
      { name: 'Metrics',    description: 'In-process counters and Redis health' },
      { name: 'Health',     description: 'Liveness probe' },
    ],
    components: {
      schemas: {
        // ── Rate limit ─────────────────────────────────────────────────────
        RateLimitRequest: {
          type: 'object',
          required: ['key', 'capacity', 'refill_per_sec'],
          properties: {
            key:          { type: 'string', example: 'user:42',  description: 'Unique identifier for the rate-limited entity' },
            capacity:     { type: 'number', example: 100,        description: 'Max tokens (burst size)' },
            refill_per_sec: { type: 'number', example: 10,       description: 'Token refill rate per second' },
          },
        },
        RateLimitResponse: {
          type: 'object',
          properties: {
            allowed:        { type: 'boolean', example: true },
            remaining:      { type: 'integer', example: 99 },
            retry_after_ms: { type: 'integer', example: 0,   description: 'Milliseconds to wait before retrying (0 if allowed)' },
          },
        },
        // ── Policy ─────────────────────────────────────────────────────────
        Policy: {
          type: 'object',
          properties: {
            id:            { type: 'integer', example: 1 },
            name:          { type: 'string',  example: 'pro' },
            capacity:      { type: 'number',  example: 500 },
            refillPerSec:  { type: 'number',  example: 50  },
            createdAt:     { type: 'string',  format: 'date-time' },
            updatedAt:     { type: 'string',  format: 'date-time' },
          },
        },
        PolicyCreate: {
          type: 'object',
          required: ['name', 'capacity', 'refill_per_sec'],
          properties: {
            name:          { type: 'string', example: 'startup',  description: 'Unique plan name' },
            capacity:      { type: 'number', example: 200,        description: 'Max burst tokens' },
            refill_per_sec: { type: 'number', example: 20,        description: 'Tokens added per second' },
          },
        },
        PolicyUpdate: {
          type: 'object',
          description: 'At least one field is required',
          properties: {
            capacity:      { type: 'number', example: 300  },
            refill_per_sec: { type: 'number', example: 30 },
          },
        },
        // ── Metrics ────────────────────────────────────────────────────────
        Metrics: {
          type: 'object',
          properties: {
            allowed:      { type: 'integer', example: 1024, description: 'Total allowed requests (this process)' },
            denied:       { type: 'integer', example: 37,   description: 'Total denied requests (this process)' },
            total:        { type: 'integer', example: 1061  },
            redisErrors:  { type: 'integer', example: 0,    description: 'Redis connection/script errors since startup' },
            redisStatus:  { type: 'string',  example: 'ok', enum: ['ok', 'error'] },
            uptime:       { type: 'number',  example: 3600.5, description: 'Process uptime in seconds' },
          },
        },
        // ── Errors ─────────────────────────────────────────────────────────
        Error400: {
          type: 'object',
          properties: {
            error:   { type: 'string', example: 'Validation failed' },
            details: { type: 'array', items: { type: 'string' }, example: ['capacity must be a positive number'] },
          },
        },
        Error404: {
          type: 'object',
          properties: {
            error: { type: 'string', example: "Policy 'unknown' not found" },
          },
        },
        Error409: {
          type: 'object',
          properties: {
            error: { type: 'string', example: "Policy 'pro' already exists" },
          },
        },
        Error429: {
          type: 'object',
          properties: {
            error:          { type: 'string',  example: 'Too Many Requests' },
            retry_after_ms: { type: 'integer', example: 850 },
          },
        },
      },
      // Rate limit response headers (reused across endpoints)
      headers: {
        XRateLimitLimit: {
          description: 'Bucket capacity (max burst)',
          schema: { type: 'integer', example: 100 },
        },
        XRateLimitRemaining: {
          description: 'Remaining tokens after this request',
          schema: { type: 'integer', example: 99 },
        },
        XRateLimitPolicy: {
          description: 'Capacity and refill window summary',
          schema: { type: 'string', example: '100;w=10' },
        },
        RetryAfter: {
          description: 'Seconds to wait before retrying (only on 429)',
          schema: { type: 'integer', example: 1 },
        },
      },
    },
  },
  // Scan all route files for @openapi JSDoc annotations
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
