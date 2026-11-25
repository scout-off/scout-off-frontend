import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/healthz
 *
 * Liveness probe for the container HEALTHCHECK (issue #1717). Checks only
 * that the Node process is serving requests — no indexer, RPC, or DB calls —
 * so an upstream outage never marks the frontend container unhealthy.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
