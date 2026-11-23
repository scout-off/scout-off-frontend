import type { LogFields, LogLevel } from './logger';

/**
 * Browser-safe structured logger emitting the same JSON line shape as
 * `lib/logger.ts`, without its Node `crypto` / `next/server` imports, so it
 * can be used from modules that run in client components.
 */
function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) =>
    emit('error', message, fields),
};
