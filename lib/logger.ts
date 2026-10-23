import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  getOrCreateTraceContext,
  outboundTraceparent,
  TRACEPARENT_HEADER,
  type TraceContext,
} from './traceContext';

/**
 * Shared request-scoped structured logging for API routes (issue #707).
 *
 * Extended by issue #1478 to propagate W3C Trace Context (`traceparent`)
 * alongside the existing `x-request-id` header. Every log line now carries
 * both `requestId` (kept for backwards-compat with existing log queries) and
 * `traceId`/`spanId` (for cross-service correlation in a W3C-compliant way).
 *
 * Framework-agnostic on purpose: it only depends on the standard `Request`/
 * `Headers` interfaces (not `NextRequest`), so the same module works in any
 * Next.js API route (Node or Edge runtime).
 */

export const REQUEST_ID_HEADER = 'x-request-id';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

/**
 * Key-name patterns that are stripped from logged fields regardless of
 * caller intent — a defense-in-depth backstop, not a substitute for callers
 * choosing what to log in the first place. Matches are case-insensitive and
 * substring-based (e.g. "signedXdr", "contactEmail" both match).
 */
const SENSITIVE_KEY_PATTERN =
  /secret|password|token|signed[-_]?xdr|xdr|signature|authorization|cookie|contact|email|phone/i;

const REDACTED = '[REDACTED]';

function redactFields(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return undefined;
  const redacted: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return redacted;
}

/** Reads an incoming trace header, or generates a fresh request id. */
export function getOrCreateRequestId(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) || randomUUID();
}

export interface RequestLogger {
  requestId: string;
  /** W3C trace id shared across the whole distributed call tree. */
  traceId: string;
  /** W3C span id for this service's leg. */
  spanId: string;
  /**
   * Returns the `traceparent` header value to forward to downstream services
   * (indexer, Express backend). Keeps the traceId, mints a new spanId.
   */
  outboundTraceparent(): string;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function emit(
  level: LogLevel,
  requestId: string,
  traceId: string,
  spanId: string,
  route: string,
  message: string,
  fields?: LogFields,
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

/**
 * Creates a logger scoped to a single request.
 *
 * Every line it emits carries:
 * - `requestId`  — propagated from `x-request-id`, or freshly generated.
 * - `traceId`    — propagated from `traceparent`, or freshly generated.
 * - `spanId`     — the span id for this service's leg of the trace.
 *
 * Use `logger.outboundTraceparent()` to get the correct `traceparent` value
 * to include when forwarding a request to the indexer or Express backend.
 */
export function createRequestLogger(request: Request): RequestLogger {
  const requestId = getOrCreateRequestId(request);
  const route = new URL(request.url).pathname;

  const traceCtx: TraceContext = getOrCreateTraceContext(request.headers);

  return {
    requestId,
    traceId: traceCtx.traceId,
    spanId: traceCtx.parentSpanId,
    outboundTraceparent: () => outboundTraceparent(traceCtx),
    info: (message, fields) =>
      emit('info', requestId, traceCtx.traceId, traceCtx.parentSpanId, route, message, fields),
    warn: (message, fields) =>
      emit('warn', requestId, traceCtx.traceId, traceCtx.parentSpanId, route, message, fields),
    error: (message, fields) =>
      emit('error', requestId, traceCtx.traceId, traceCtx.parentSpanId, route, message, fields),
  };
}

/** Stamps the request id and traceparent onto a response so a client can report them back. */
export function withRequestId(
  response: NextResponse,
  requestId: string,
  traceparent?: string,
): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (traceparent) {
    response.headers.set(TRACEPARENT_HEADER, traceparent);
  }
  return response;
}
