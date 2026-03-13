import { createApp } from './app';
import { getRedisClient, closeRedisClient } from './config/redis';
import { env } from './config/env';

const app = createApp();

// Eagerly connect Redis on startup
getRedisClient();

const server = app.listen(env.port, () => {
  console.log(`[Server] Running on port ${env.port} (${env.nodeEnv})`);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[Server] ${signal} received — shutting down`);
  server.close(async () => {
    await closeRedisClient();
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
