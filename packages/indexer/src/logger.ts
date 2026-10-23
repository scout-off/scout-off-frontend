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
 *   traceId / spanId – W3C trace context, present while a context is active
 *                (issue #1478, see withTraceContext)
 *   …fields    – any caller-supplied extra fields (spread last)
 *
 * The old `ts` / `msg` field names are no longer emitted so log queries
 * written against `timestamp` and `message` work across all three services.
 */

import { randomBytes } from 'crypto';

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

// ── W3C Trace Context ────────────────────────────────────────────────────────

const TRACEPARENT_HEADER = 'traceparent';
const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

function generateHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Parses a W3C `traceparent` header value. Returns null when absent or
 * malformed so the caller can generate a fresh root context.
 */
export function parseTraceparent(value: string | null | undefined): TraceContext | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m) return null;
  const [, , traceId, spanId, flags] = m;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

/** Mints a fresh root trace context (no upstream caller). */
export function newTraceContext(): TraceContext {
  return { traceId: generateHex(16), spanId: generateHex(8), sampled: true };
}

/**
 * Returns the `traceparent` value to forward to downstream services —
 * same traceId, fresh spanId.
 */
export function makeChildTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${generateHex(8)}-${ctx.sampled ? '01' : '00'}`;
}

// ── Logger ───────────────────────────────────────────────────────────────────

// Module-level active trace context; set via withTraceContext() per request.
let activeTrace: TraceContext | null = null;

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
    // Issue #1478: include traceId/spanId when a trace context is active.
    ...(activeTrace
      ? { traceId: activeTrace.traceId, spanId: activeTrace.spanId }
      : {}),
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

/**
 * Sets the active trace context for the current (synchronous) execution
 * scope. Call this at the start of each incoming HTTP request handler,
 * passing the context parsed from the `traceparent` header:
 *
 * ```ts
 * const ctx = parseTraceparent(req.headers[TRACEPARENT_HEADER]) ?? newTraceContext();
 * withTraceContext(ctx, () => {
 *   // all logger calls here will carry ctx.traceId / ctx.spanId
 * });
 * ```
 *
 * NOTE: This sets a module-level variable. For concurrent async requests in
 * a single-process HTTP server, prefer passing the context explicitly as a
 * field in each `logger.*` call instead.
 */
export function withTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  const prev = activeTrace;
  activeTrace = ctx;
  try {
    return fn();
  } finally {
    activeTrace = prev;
  }
}

export { TRACEPARENT_HEADER };
