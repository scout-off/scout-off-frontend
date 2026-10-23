/**
 * Structured JSON logger for the indexer (issue #1519).
 *
 * Aligns to the shared log-line schema used by the Next.js app
 * (lib/logger.ts) and the Express backend (server/src/logger.js) so that
 * log-aggregator queries written for one service work for the others without
 * field-name translation.
 *
 * Shared schema fields:
 *   timestamp  – ISO-8601 string   (was `ts` in the old indexer logger)
 *   level      – debug | info | warn | error
 *   message    – human-readable description  (was `msg`)
 *   requestId  – correlation id, optional for the indexer since it has no
 *                HTTP request boundary, but available via createScopedLogger
 *   route      – optional; populated by createScopedLogger
 *   …fields    – any caller-supplied extra fields (spread last)
 *
 * The old `ts` / `msg` field names are no longer emitted so log queries
 * written against `timestamp` and `message` work across all three services.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return 'info';
}

const currentLevel = getCurrentLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function emit(
  level: LogLevel,
  message: string,
  fields?: LogFields,
  scope?: { requestId?: string; route?: string },
): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    ...(scope?.requestId !== undefined ? { requestId: scope.requestId } : {}),
    ...(scope?.route !== undefined ? { route: scope.route } : {}),
    message,
    ...(fields ?? {}),
  };

  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Module-level logger — use for indexer-wide messages not tied to a
 * specific ledger range or pipeline run.
 */
export const logger = {
  debug(message: string, fields?: LogFields): void {
    emit('debug', message, fields);
  },
  info(message: string, fields?: LogFields): void {
    emit('info', message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    emit('warn', message, fields);
  },
  error(message: string, fields?: LogFields): void {
    emit('error', message, fields);
  },
};

/**
 * Creates a scoped logger that stamps every line with an optional
 * `requestId` and `route` so lines from the same indexer pipeline run can
 * be correlated in a log aggregator — mirrors `createRequestLogger` in
 * lib/logger.ts and server/src/logger.js.
 */
export function createScopedLogger(scope: {
  requestId?: string;
  route?: string;
}) {
  return {
    debug(message: string, fields?: LogFields): void {
      emit('debug', message, fields, scope);
    },
    info(message: string, fields?: LogFields): void {
      emit('info', message, fields, scope);
    },
    warn(message: string, fields?: LogFields): void {
      emit('warn', message, fields, scope);
    },
    error(message: string, fields?: LogFields): void {
      emit('error', message, fields, scope);
    },
  };
}
