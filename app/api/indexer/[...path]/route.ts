import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  getOrCreateTraceContext,
  outboundTraceparent,
  TRACEPARENT_HEADER,
} from '@/lib/traceContext';

// Same-origin proxy for packages/indexer's query API (issue #1332, extended
// by #1298 for /players and /health, #1478 for W3C trace context propagation).
// The indexer sends no CORS headers and has no auth or rate limiting of its
// own, so browser code (lib/indexerClient.ts) calls /api/indexer/* instead of
// the indexer origin, and this route forwards only the allow-listed query
// routes to INDEXER_API_URL_INTERNAL — keeping the indexer on a private
// network.
//
// Issue #1478: the incoming `traceparent` (or a freshly minted one) is
// forwarded to the indexer so a cross-service trace can be assembled end-to-end.
//
// Issue #1522: the indexer serves /players, /players/:id/events and
// /validators/:id/events with no ETag or Last-Modified, so SWR
// revalidation/polling re-downloaded identical JSON on every refresh. For
// successful GETs the proxy now derives a strong ETag from the upstream
// body (or forwards the indexer's own ETag/Last-Modified if it ever starts
// sending them) and honours If-None-Match, returning 304 when the client
// already has the current representation.

const FETCH_TIMEOUT_MS = 5000;
const RATE_LIMIT = { limit: 120, windowMs: 60_000 };
// Public event queries are safe to cache briefly at the edge.
const CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=30';

const GET_ROUTES = [
  /^events$/,
  /^health$/,
  /^players$/,
  /^players\/[^/]+\/events$/,
  /^validators\/[^/]+\/events$/,
];
const POST_ROUTES = [/^validators\/approval-counts$/];

function indexerBaseUrl(): string {
  return (
    process.env.INDEXER_API_URL_INTERNAL ??
    process.env.NEXT_PUBLIC_INDEXER_API_URL ??
    'http://localhost:3001'
  ).replace(/\/+$/, '');
}

function isAllowed(method: 'GET' | 'POST', path: string): boolean {
  const routes = method === 'GET' ? GET_ROUTES : POST_ROUTES;
  return routes.some((route) => route.test(path));
}

/** Derive a strong ETag (a quoted SHA-1 hex digest) from the body bytes. */
function computeEtag(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex')}"`;
}

/**
 * Compare a client's If-None-Match header against the response ETag using
 * the weak comparison of RFC 7232 § 2.3.2 — for If-None-Match the W/ prefix
 * is ignored, so `W/"abc"` and `"abc"` are considered equal. A header value
 * of "*" matches any existing representation (i.e. any successful GET).
 */
function ifNoneMatchMatches(header: string, etag: string): boolean {
  const stripWeak = (t: string) => (t.startsWith('W/') ? t.slice(2) : t);
  return header
    .split(',')
    .map((t) => t.trim())
    .some((candidate) => {
      if (candidate === '*') return true;
      return stripWeak(candidate) === stripWeak(etag);
    });
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function proxy(
  req: NextRequest,
  method: 'GET' | 'POST',
  segments: string[],
): Promise<NextResponse> {
  const path = segments.map(encodeURIComponent).join('/');
  if (!isAllowed(method, path)) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const { limited, retryAfterSec } = await checkRateLimit(
    `indexer-proxy:${getClientIp(req)}`,
    RATE_LIMIT,
  );
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec ?? 60) },
      },
    );
  }

  // Issue #1478: propagate W3C trace context to the indexer so a single user
  // action that spans Next.js → indexer can be correlated end-to-end.
  const traceCtx = getOrCreateTraceContext(req.headers);
  const traceparent = outboundTraceparent(traceCtx);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `${indexerBaseUrl()}/${path}${req.nextUrl.search}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          [TRACEPARENT_HEADER]: traceparent,
        },
        body: method === 'POST' ? await req.text() : undefined,
        signal: controller.signal,
        cache: 'no-store',
      },
    );

    // Conditional requests only apply to cacheable GETs (issue #1522).
    // POSTs and non-2xx responses are forwarded as-is.
    if (method === 'GET' && upstream.ok) {
      const raw = await upstream.text();
      // Forward the indexer's own ETag if it ever starts sending one;
      // otherwise derive a strong ETag from the body so SWR's
      // revalidation can short-circuit to a 304 instead of re-downloading
      // identical JSON.
      const etag = upstream.headers.get('etag') ?? computeEtag(raw);
      const lastModified = upstream.headers.get('last-modified');

      const headers: Record<string, string> = {
        'Cache-Control': CACHE_CONTROL,
        ETag: etag,
      };
      if (lastModified) headers['Last-Modified'] = lastModified;

      const ifNoneMatch = req.headers.get('if-none-match');
      if (ifNoneMatch && ifNoneMatchMatches(ifNoneMatch, etag)) {
        // 304 carries the validators + Cache-Control so caches update
        // the stored metadata, but no body (RFC 7232 § 4.1).
        return new NextResponse(null, { status: 304, headers });
      }

      return NextResponse.json(safeJsonParse(raw), {
        status: upstream.status,
        headers,
      });
    }

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { error: timedOut ? 'Indexer request timed out' : 'Indexer unreachable' },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, props: RouteContext) {
  const params = await props.params;
  return proxy(req, 'GET', params.path);
}

export async function POST(req: NextRequest, props: RouteContext) {
  const params = await props.params;
  return proxy(req, 'POST', params.path);
}
