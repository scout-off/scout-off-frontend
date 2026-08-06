import { NextResponse } from 'next/server';

// Proxies the indexer's and backend API's own /health endpoints server-side
// (see packages/indexer/src/server.ts's handleHealth, server/src/app.js's
// `GET /health`) so the browser never has to reach either origin directly —
// avoids CORS config on those services and keeps NEXT_PUBLIC_* base URLs
// out of a second round of client-side fetches. Used by the admin System
// Health page (app/[locale]/admin/health/page.tsx); the contract check is
// deliberately NOT proxied here — it reuses hooks/useContractHealth's
// existing client-side RPC polling directly instead of duplicating it.

const FETCH_TIMEOUT_MS = 5000;

export type SubsystemStatus = 'ok' | 'degraded' | 'unreachable';

export interface SubsystemHealth {
  status: SubsystemStatus;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface AggregateHealthResponse {
  indexer: SubsystemHealth;
  backend: SubsystemHealth;
  checkedAt: number;
}

async function checkEndpoint(
  baseUrl: string | undefined,
): Promise<SubsystemHealth> {
  if (!baseUrl) {
    return { status: 'unreachable', error: 'Base URL not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      return { status: 'unreachable', error: `HTTP ${res.status}` };
    }

    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    const status: SubsystemStatus =
      data?.status === 'degraded' ? 'degraded' : 'ok';
    return { status, detail: data };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Request timed out'
          : err.message
        : 'Request failed';
    return { status: 'unreachable', error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  // Each check is independent — a rejected/aborted fetch to one service
  // must not affect the other (Promise.all over settled per-check results,
  // not a throwing await chain).
  const [indexer, backend] = await Promise.all([
    checkEndpoint(process.env.NEXT_PUBLIC_INDEXER_API_URL),
    checkEndpoint(
      process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL,
    ),
  ]);

  const response: AggregateHealthResponse = {
    indexer,
    backend,
    checkedAt: Date.now(),
  };

  return NextResponse.json(response);
}
