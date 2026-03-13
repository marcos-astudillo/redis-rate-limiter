import { Request, Response, NextFunction } from 'express';

// TODO (Phase 5): implement Token Bucket middleware
export function rateLimiter() {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // Placeholder — wired up in Phase 5
    next();
  };
}
