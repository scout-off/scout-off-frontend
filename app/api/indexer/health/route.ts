import { NextResponse } from 'next/server';

// Public, read-only freshness probe for indexer-backed views (see #1357).
// Proxies the indexer's own /health server-side (like app/api/admin/health)
// but exposes only the fields DataFreshnessBadge and the history-gap banner
// need.
//
// Uses INDEXER_API_URL_INTERNAL (server-only) so the internal indexer address
// is not inlined into the client bundle (#1492). Falls back to the deprecated
// NEXT_PUBLIC_INDEXER_API_URL for deployments that haven't set the new var.

const FETCH_TIMEOUT_MS = 5000;

export const dynamic = 'force-dynamic';

export interface IndexerGap {
  gap_start: number;
  gap_end: number;
  status: 'open' | 'backfilling' | 'closed';
}

export interface IndexerFreshness {
  lastLedger: number | null;
  lastUpdated: number | null;
  ledgerLag: number | null;
  /** Ledger ranges the indexer has not (fully) ingested yet. */
  gaps?: IndexerGap[];
  /** True while any gap is still open or being backfilled. */
  historyIncomplete?: boolean;
}

function isGap(value: unknown): value is IndexerGap {
  const g = value as IndexerGap;
  return (
    typeof g === 'object' &&
    g !== null &&
    typeof g.gap_start === 'number' &&
    typeof g.gap_end === 'number' &&
    (g.status === 'open' || g.status === 'backfilling' || g.status === 'closed')
  );
}

export async function GET() {
  const baseUrl =
    process.env.INDEXER_API_URL_INTERNAL ??
    process.env.NEXT_PUBLIC_INDEXER_API_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Indexer not configured' },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Indexer unavailable' },
        { status: 502 },
      );
    }
    const data = await res.json();
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    const gaps = Array.isArray(data?.gaps) ? data.gaps.filter(isGap) : [];
    const body: IndexerFreshness = {
      lastLedger: num(data?.lastLedger),
      lastUpdated: num(data?.lastUpdated),
      ledgerLag: num(data?.ledgerLag),
      gaps,
      historyIncomplete: gaps.some((g: IndexerGap) => g.status !== 'closed'),
    };
    const response = NextResponse.json(body);
    if (body.lastLedger !== null) {
      response.headers.set('X-Indexer-Last-Ledger', String(body.lastLedger));
    }
    if (body.lastUpdated !== null) {
      response.headers.set('X-Indexer-Last-Updated', String(body.lastUpdated));
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Indexer unavailable' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
