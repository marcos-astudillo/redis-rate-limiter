/**
 * In-process metrics counters.
 *
 * These are per-instance counters — suitable for single-instance deployments
 * or as a fast approximation in a fleet. For distributed aggregation, counters
 * should be pushed to Redis or a dedicated metrics system (Prometheus, etc.).
 */

interface Counters {
  totalRequests:  number;
  allowedRequests: number;
  deniedRequests:  number;
  redisErrors:     number;
}

const counters: Counters = {
  totalRequests:   0,
  allowedRequests: 0,
  deniedRequests:  0,
  redisErrors:     0,
};

const startedAt = new Date().toISOString();

export function incrementTotal():       void { counters.totalRequests++; }
export function incrementAllowed():     void { counters.allowedRequests++; }
export function incrementDenied():      void { counters.deniedRequests++; }
export function incrementRedisErrors(): void { counters.redisErrors++; }

export function getMetrics() {
  return {
    ...counters,
    uptimeSec: Math.floor(process.uptime()),
    startedAt,
    memoryMb:  +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
  };
}
