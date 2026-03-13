import { Router } from 'express';
import { checkLimit } from '../controllers/ratelimit.controller';

export const rateLimitRoutes = Router();

// POST /v1/ratelimit/check
rateLimitRoutes.post('/check', checkLimit);
