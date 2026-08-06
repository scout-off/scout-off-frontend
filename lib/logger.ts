import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Shared request-scoped structured logging for API routes (issue #707).
 *
 * Framework-agnostic on purpose: it only depends on the standard `Request`/
 * `Headers` interfaces (not `NextRequest`), so the same module works in any
 * Next.js API route (Node or Edge runtime) without adopting a full
 * observability platform — just consistent, grep/query-able JSON lines
 * correlated by a request id.
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
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function emit(
  level: LogLevel,
  requestId: string,
  route: string,
  message: string,
  fields?: LogFields,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    requestId,
    route,
    message,
    ...redactFields(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Creates a logger scoped to a single request — every line it emits carries
 * the same `requestId` (propagated from an incoming `x-request-id` header,
 * or freshly generated) and the request's route, so log lines from the same
 * request can be correlated across a log aggregator.
 */
export function createRequestLogger(request: Request): RequestLogger {
  const requestId = getOrCreateRequestId(request);
  const route = new URL(request.url).pathname;

  return {
    requestId,
    info: (message, fields) => emit('info', requestId, route, message, fields),
    warn: (message, fields) => emit('warn', requestId, route, message, fields),
    error: (message, fields) =>
      emit('error', requestId, route, message, fields),
  };
}

/** Stamps the request id onto a response so a client can report it back. */
export function withRequestId(
  response: NextResponse,
  requestId: string,
): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
