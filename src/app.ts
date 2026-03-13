import express from 'express';
import { rateLimitRoutes } from './routes/ratelimit.routes';
import { errorHandler } from './middlewares/errorHandler';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Rate limiter microservice API
  app.use('/v1/ratelimit', rateLimitRoutes);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
