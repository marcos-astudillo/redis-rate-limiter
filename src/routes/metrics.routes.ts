import { Router } from 'express';
import { metricsHandler } from '../controllers/metrics.controller';

export const metricsRoutes = Router();

metricsRoutes.get('/', metricsHandler);
