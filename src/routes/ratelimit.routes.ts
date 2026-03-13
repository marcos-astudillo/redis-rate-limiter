import { Router } from 'express';
import { checkLimit } from '../controllers/ratelimit.controller';

export const rateLimitRoutes = Router();

/**
 * @openapi
 * /ratelimit/check:
 *   post:
 *     summary: Check and consume a token for a given key
 *     description: |
 *       Core token bucket endpoint. Pass an arbitrary key (user ID, IP, API key, etc.),
 *       the bucket capacity, and the refill rate. Returns whether the request is allowed
 *       and how many tokens remain.
 *
 *       **Response headers** on every call:
 *       - `X-RateLimit-Limit` — bucket capacity
 *       - `X-RateLimit-Remaining` — tokens left after this request
 *       - `X-RateLimit-Policy` — compact policy descriptor (`capacity;w=window`)
 *       - `Retry-After` — seconds to wait (only on **429**)
 *     tags: [Rate Limit]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RateLimitRequest'
 *           examples:
 *             user:
 *               summary: Rate limit by user ID
 *               value: { key: "user:42", capacity: 100, refill_per_sec: 10 }
 *             ip:
 *               summary: Rate limit by IP address
 *               value: { key: "ip:203.0.113.5", capacity: 30, refill_per_sec: 1 }
 *     responses:
 *       '200':
 *         description: Request allowed
 *         headers:
 *           X-RateLimit-Limit:
 *             $ref: '#/components/headers/XRateLimitLimit'
 *           X-RateLimit-Remaining:
 *             $ref: '#/components/headers/XRateLimitRemaining'
 *           X-RateLimit-Policy:
 *             $ref: '#/components/headers/XRateLimitPolicy'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RateLimitResponse'
 *             example:
 *               allowed: true
 *               remaining: 99
 *               retry_after_ms: 0
 *       '429':
 *         description: Rate limit exceeded
 *         headers:
 *           Retry-After:
 *             $ref: '#/components/headers/RetryAfter'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error429'
 *             example:
 *               allowed: false
 *               remaining: 0
 *               retry_after_ms: 850
 *       '400':
 *         description: Validation error (missing or invalid fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error400'
 */
rateLimitRoutes.post('/check', checkLimit);
