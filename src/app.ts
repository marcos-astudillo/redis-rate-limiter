import express from 'express';
import { rateLimitRoutes } from './routes/ratelimit.routes';
import { policyRoutes }    from './routes/policy.routes';
import { metricsRoutes }   from './routes/metrics.routes';
import { errorHandler }    from './middlewares/errorHandler';
import { requestLogger }   from './middlewares/requestLogger';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(requestLogger);

  // Health check — no rate limiting applied here
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Core rate-limit check API (used as a standalone microservice)
  app.use('/v1/ratelimit', rateLimitRoutes);

  // Plan policy CRUD (admin — add auth middleware in production)
  app.use('/v1/policies', policyRoutes);

  // Internal metrics
  app.use('/v1/metrics', metricsRoutes);

  // Global error handler — must be registered last
  app.use(errorHandler);

  return app;
}
