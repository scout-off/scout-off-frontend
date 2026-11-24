import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/auth/session
 *
 * Returns the caller's authentication state based on the `session` cookie.
 *
 * Rate limiting: max 30 requests per IP per 10 seconds, enforced via the
 * shared lib/rateLimit.ts (Redis-backed in production, in-memory in dev —
 * see that file for why a per-route in-memory Map isn't sufficient). Uses
 * the sliding-window algorithm so bursts at window boundaries cannot
 * double the effective limit. When exceeded, responds with 429 Too Many
 * Requests and a Retry-After header.
 *
 * Real client IP is extracted from the x-forwarded-for header, same
 * convention as app/api/players/search/route.ts and
 * app/api/ipfs/upload/route.ts.
 */
const RATE_LIMIT = 30;
const WINDOW_MS = 10 * 1000;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);

  const rl = await checkRateLimit(`auth-session:${ip}`, {
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
    algorithm: 'sliding',
  });
  if (rl.limited) {
    console.warn(`[session rate limit] Too many requests from IP: ${ip}`);
    const retryAfter = rl.retryAfterSec ?? Math.ceil(WINDOW_MS / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const session = req.cookies.get('session');

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    publicKey: session.value,
  });
}
