type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;

function log(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    context,
    message,
    ...meta,
  });
  if (level === 'error') {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

export const logger = {
  debug: (ctx: string, msg: string, meta?: Record<string, unknown>) => log('debug', ctx, msg, meta),
  info:  (ctx: string, msg: string, meta?: Record<string, unknown>) => log('info',  ctx, msg, meta),
  warn:  (ctx: string, msg: string, meta?: Record<string, unknown>) => log('warn',  ctx, msg, meta),
  error: (ctx: string, msg: string, meta?: Record<string, unknown>) => log('error', ctx, msg, meta),
};
