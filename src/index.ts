import { createApp } from './app';
import { getRedisClient, closeRedisClient } from './config/redis';
import { closeDbPool } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';

// Eagerly establish connections on startup
getRedisClient();

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info('Server', `Listening on port ${env.port}`, { env: env.nodeEnv });
});

async function shutdown(signal: string): Promise<void> {
  logger.info('Server', `${signal} received — shutting down gracefully`);
  server.close(async () => {
    await Promise.all([closeRedisClient(), closeDbPool()]);
    logger.info('Server', 'Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Process', 'Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
