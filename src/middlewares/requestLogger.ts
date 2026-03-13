import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP', `${req.method} ${req.path}`, {
      status:     res.statusCode,
      durationMs: Date.now() - start,
      ip:         req.ip,
    });
  });
  next();
}
