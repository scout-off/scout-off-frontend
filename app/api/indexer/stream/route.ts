/**
 * app/api/indexer/stream/route.ts
 *
 * Proxy for the indexer's GET /stream SSE endpoint.
 * This keeps CORS and auth consistent: the browser only ever talks to the
 * Next.js origin; this route forwards the connection (and Last-Event-ID)
 * upstream and pipes the response body back verbatim.
 *
 * Query params validated and forwarded: topics, wallet, lastEventId (#1492).
 *
 * Lifecycle: request.signal is forwarded upstream so the indexer connection
 * is aborted immediately when the browser disconnects (#1491).
 *
 * Issue #1478: the incoming `traceparent` (or a freshly minted one) is
 * forwarded to the indexer so SSE connections are linked to the same
 * distributed trace as the REST requests that precede them.
 */
import { NextRequest } from 'next/server';
import {
  getOrCreateTraceContext,
  outboundTraceparent,
  TRACEPARENT_HEADER,
} from '@/lib/traceContext';

// Use the server-only variable so the internal indexer address is never
// inlined into the client bundle (#1492). Fall back to the deprecated
// NEXT_PUBLIC_ variable only when the server-only one is absent, to ease
// migration for deployments that haven't added INDEXER_API_URL_INTERNAL yet.
function indexerBase(): string {
  return (
    process.env.INDEXER_API_URL_INTERNAL ??
    process.env.NEXT_PUBLIC_INDEXER_API_URL ??
    'http://localhost:3001'
  ).replace(/\/+$/, '');
}

export const dynamic = 'force-dynamic';
// Disable body buffering so SSE frames are flushed immediately.
export const runtime = 'nodejs';

// ── Query-param validation (#1492) ────────────────────────────────────────────

/** Stellar public key: G… followed by 55 base-32 characters. */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** Comma-separated list of non-empty topic slugs (alphanumeric / - / _). */
const TOPICS_RE = /^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+)*$/;

/**
 * lastEventId is opaque to this proxy but must not contain characters that
 * could be used for header injection or URL smuggling.
 */
const LAST_EVENT_ID_RE = /^[a-zA-Z0-9_\-.:/]{1,128}$/;

function validateParams(searchParams: URLSearchParams):
  | { topics?: string; wallet?: string; lastEventId?: string }
  | { error: string } {
  const topics = searchParams.get('topics');
  const wallet = searchParams.get('wallet');
  const lastEventId = searchParams.get('lastEventId');

  if (topics !== null && !TOPICS_RE.test(topics)) {
    return { error: 'Invalid topics parameter' };
  }
  if (wallet !== null && !STELLAR_ADDRESS_RE.test(wallet)) {
    return { error: 'Invalid wallet parameter' };
  }
  if (lastEventId !== null && !LAST_EVENT_ID_RE.test(lastEventId)) {
    return { error: 'Invalid lastEventId parameter' };
  }

  return {
    ...(topics !== null ? { topics } : {}),
    ...(wallet !== null ? { wallet } : {}),
    ...(lastEventId !== null ? { lastEventId } : {}),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;

  const validated = validateParams(searchParams);
  if ('error' in validated) {
    return new Response(JSON.stringify({ error: validated.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = new URL(`${indexerBase()}/stream`);
  if (validated.topics !== undefined)
    upstream.searchParams.set('topics', validated.topics);
  if (validated.wallet !== undefined)
    upstream.searchParams.set('wallet', validated.wallet);
  if (validated.lastEventId !== undefined)
    upstream.searchParams.set('lastEventId', validated.lastEventId);

  const upstreamHeaders: HeadersInit = {
    Accept: 'text/event-stream',
  };

  // Issue #1478: forward W3C trace context to the indexer.
  const traceCtx = getOrCreateTraceContext(request.headers);
  upstreamHeaders[TRACEPARENT_HEADER] = outboundTraceparent(traceCtx);

  const lastEventId = request.headers.get('last-event-id');
  if (lastEventId) {
    upstreamHeaders['Last-Event-ID'] = lastEventId;
  }

  let upstreamResponse: globalThis.Response;
  try {
    upstreamResponse = await fetch(upstream.toString(), {
      headers: upstreamHeaders,
      // Forward the browser's AbortSignal so the upstream SSE connection is
      // torn down as soon as the client disconnects (#1491).
      signal: request.signal,
      // @ts-expect-error — Node 18+ fetch supports duplex
      duplex: 'half',
    });
  } catch (err) {
    // AbortError means the client already disconnected; nothing to send back.
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }
    return new Response(
      JSON.stringify({ error: 'Indexer stream unavailable' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response(JSON.stringify({ error: 'Indexer stream error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
