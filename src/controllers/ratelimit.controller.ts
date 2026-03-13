import { Request, Response, NextFunction } from 'express';

// TODO (Phase 2): implement with TokenBucketService
export async function checkLimit(
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  res.status(501).json({ message: 'Not implemented yet' });
}
