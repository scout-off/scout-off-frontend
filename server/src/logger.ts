import crypto from 'crypto';
import type { Request } from 'express';

type Fields = Record<string, unknown>;
type Level = 'info' | 'warn' | 'error';

export interface TraceContext {
  traceId: string;
  parentSpanId: string;
  sampled: boolean;
}

export interface RequestLogger {
  requestId: string;
  traceId: string;
  spanId: string;
  outboundTraceparent: () => string;
  info: (message: string, fields?: Fields) => void;
  warn: (message: string, fields?: Fields) => void;
  error: (message: string, fields?: Fields) => void;
}

/**
 * Request-scoped structured logging for the off-chain backend (issue #707).
 * Mirrors the Next.js app's lib/logger.ts JSON line shape
 * (timestamp/level/requestId/route/message/...fields) so log lines from
 * either service read the same way in whatever log aggregator ends up
 * consuming them, without either service depending on the other.
 *
 * Extended by issue #1478 to propagate W3C Trace Context (`traceparent`).
 * Each log line now also carries `traceId` and `spanId` for cross-service
 * correlation. The middleware (requestLogger.js) echoes the traceparent back
 * on the response so an upstream proxy can confirm it was received.
 */

export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACEPARENT_HEADER = 'traceparent';

// W3C traceparent format: 00-<32hex>-<16hex>-<2hex>
const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

const SENSITIVE_KEY_PATTERN =
  /secret|password|token|signed[-_]?xdr|xdr|signature|authorization|cookie|contact|email|phone/i;

const REDACTED = '[REDACTED]';

function redactFields(fields?: Fields): Fields | undefined {
  if (!fields) return undefined;
  const redacted: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return redacted;
}

function generateHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Parses an incoming `traceparent` header. Returns { traceId, parentSpanId,
 * sampled } on success, or null when the value is absent or malformed.
 */
function parseTraceparent(value: string | undefined): TraceContext | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m) return null;
  const [, , traceId, parentSpanId, flags] = m;
  // All-zeros values are forbidden by the spec.
  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) return null;
  return {
    traceId: traceId.toLowerCase(),
    parentSpanId: parentSpanId.toLowerCase(),
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

/** Builds a child traceparent: same traceId, fresh spanId. */
export function makeChildTraceparent(ctx: TraceContext): string {
  const childSpanId = generateHex(8);
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${childSpanId}-${flags}`;
}

export function getOrCreateRequestId(req: Request): string {
  const given = req.headers[REQUEST_ID_HEADER];
  return (typeof given === 'string' && given) || crypto.randomUUID();
}

/**
 * Resolves a W3C trace context from the incoming request headers, or mints a
 * fresh root context when the `traceparent` header is absent/malformed.
 */
export function getOrCreateTraceContext(req: Request): TraceContext {
  const header = req.headers[TRACEPARENT_HEADER];
  const incoming = parseTraceparent(
    typeof header === 'string' ? header : undefined,
  );
  if (incoming) return incoming;
  return {
    traceId: generateHex(16),
    parentSpanId: generateHex(8),
    sampled: true,
  };
}

function emit(
  level: Level,
  requestId: string,
  traceId: string,
  spanId: string,
  route: string,
  message: string,
  fields?: Fields,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    requestId,
    traceId,
    spanId,
    route,
    message,
    ...redactFields(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createRequestLogger(req: Request): RequestLogger {
  const requestId = getOrCreateRequestId(req);
  const traceCtx = getOrCreateTraceContext(req);
  const route = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;

  return {
    requestId,
    traceId: traceCtx.traceId,
    spanId: traceCtx.parentSpanId,
    /** Returns a child traceparent for forwarding to downstream services. */
    outboundTraceparent: () => makeChildTraceparent(traceCtx),
    info: (message, fields) =>
      emit(
        'info',
        requestId,
        traceCtx.traceId,
        traceCtx.parentSpanId,
        route,
        message,
        fields,
      ),
    warn: (message, fields) =>
      emit(
        'warn',
        requestId,
        traceCtx.traceId,
        traceCtx.parentSpanId,
        route,
        message,
        fields,
      ),
    error: (message, fields) =>
      emit(
        'error',
        requestId,
        traceCtx.traceId,
        traceCtx.parentSpanId,
        route,
        message,
        fields,
      ),
  };
}
