import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec }   from './config/swagger';
import { rateLimitRoutes } from './routes/ratelimit.routes';
import { policyRoutes }    from './routes/policy.routes';
import { metricsRoutes }   from './routes/metrics.routes';
import { errorHandler }    from './middlewares/errorHandler';
import { requestLogger }   from './middlewares/requestLogger';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(requestLogger);

  // ── Swagger UI ─────────────────────────────────────────────────────────────
  // Available at /api-docs in all environments (add auth guard in production)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Redis Rate Limiter API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
    },
  }));

  // Expose the raw OpenAPI JSON (useful for code generation tools)
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // ── API routes ─────────────────────────────────────────────────────────────
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
