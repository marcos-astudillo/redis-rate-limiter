import { Router } from 'express';
import { metricsHandler } from '../controllers/metrics.controller';

export const metricsRoutes = Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Get in-process counters and Redis health
 *     description: |
 *       Returns per-process counters (not aggregated across instances).
 *       In a multi-replica deployment, scrape each pod individually or migrate
 *       counters to Redis for global aggregation.
 *     tags: [Metrics]
 *     responses:
 *       '200':
 *         description: Current metrics snapshot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Metrics'
 *             example:
 *               allowed: 1024
 *               denied: 37
 *               total: 1061
 *               redisErrors: 0
 *               redisStatus: ok
 *               uptime: 3600.5
 */
metricsRoutes.get('/', metricsHandler);
