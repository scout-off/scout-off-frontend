/**
 * lib/traceContext.ts — W3C Trace Context helpers (issue #1478).
 *
 * Implements just enough of the W3C traceparent / tracestate spec
 * (https://www.w3.org/TR/trace-context/) to propagate a single trace id
 * across the Next.js API routes, the indexer proxy, and the Express
 * backend — without pulling in a full OpenTelemetry SDK.
 *
 * Format: `00-<trace-id>-<span-id>-<flags>`
 *   - version:  "00" (the only non-future version)
 *   - trace-id: 32 hex chars (128-bit)
 *   - parent-id / span-id: 16 hex chars (64-bit)
 *   - flags: "01" (sampled)
 *
 * Usage pattern
 * ─────────────
 * Incoming request → parseTraceparent() to extract or generate a context.
 * Outgoing fetch()  → headers['traceparent'] = makeChildTraceparent(ctx).
 * Log lines         → include traceId and spanId.
 */

import { randomBytes } from 'crypto';

export const TRACEPARENT_HEADER = 'traceparent';
export const TRACESTATE_HEADER = 'tracestate';

const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export interface TraceContext {
  /** 32-char hex trace id — the same across the whole distributed call tree. */
  traceId: string;
  /** 16-char hex span id — the *incoming* span from the upstream caller. */
  parentSpanId: string;
  /** Whether this trace is sampled (flags & 0x01). */
  sampled: boolean;
}

/** Generates a cryptographically random 128-bit trace id (32 hex chars). */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Generates a cryptographically random 64-bit span id (16 hex chars). */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Parses an incoming `traceparent` header value.
 * Returns null when the value is absent or malformed (callers should then
 * generate a fresh context with {@link newTraceContext}).
 */
export function parseTraceparent(value: string | null | undefined): TraceContext | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m) return null;
  const [, /* version */ , traceId, parentSpanId, flags] = m;
  // All-zeros trace-id or span-id are forbidden by the spec.
  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) return null;
  return {
    traceId: traceId.toLowerCase(),
    parentSpanId: parentSpanId.toLowerCase(),
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

/** Creates a fresh root trace context (no upstream caller). */
export function newTraceContext(): TraceContext {
  return {
    traceId: generateTraceId(),
    parentSpanId: generateSpanId(),
    sampled: true,
  };
}

/**
 * Reads the `traceparent` header from a request, parsing it when present or
 * generating a new root context when absent/malformed.
 */
export function getOrCreateTraceContext(headers: {
  get(name: string): string | null;
}): TraceContext {
  return (
    parseTraceparent(headers.get(TRACEPARENT_HEADER)) ?? newTraceContext()
  );
}

/**
 * Builds a `traceparent` header value for a child span — keeps the
 * incoming `traceId` (so the whole call tree shares it) but mints a fresh
 * `spanId` for this leg of the journey, per the W3C spec.
 */
export function makeChildTraceparent(ctx: TraceContext): string {
  const childSpanId = generateSpanId();
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${childSpanId}-${flags}`;
}

/**
 * Returns the `traceparent` header that should be forwarded to a downstream
 * service: propagate the existing context (keeping traceId, minting a new
 * spanId) so the downstream leg is linked to the same distributed trace.
 */
export function outboundTraceparent(ctx: TraceContext): string {
  return makeChildTraceparent(ctx);
}
