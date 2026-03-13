import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('ErrorHandler', err.message, {
    method: req.method,
    path: req.path,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });
  res.status(500).json({ error: 'Internal server error' });
}
