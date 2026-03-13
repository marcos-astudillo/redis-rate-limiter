import { Request, Response } from 'express';
import { getMetrics } from '../services/metrics.service';
import { getRedisClient } from '../config/redis';

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  let redisStatus = 'unknown';
  try {
    await getRedisClient().ping();
    redisStatus = 'ok';
  } catch {
    redisStatus = 'error';
  }

  res.json({
    ...getMetrics(),
    redis: redisStatus,
  });
}
