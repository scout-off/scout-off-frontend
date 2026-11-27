import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * On-demand revalidation webhook for player profile pages.
 *
 * The indexer POSTs a JSON body of the form:
 *   { "playerId": "G...", "reason": "milestone_approved", "timestamp": 1700000000000 }
 * signed with HMAC-SHA256 over the raw body using REVALIDATE_SECRET. The
 * signature is sent in the `x-revalidate-signature` header as a hex digest.
 *
 * On success we invalidate the `player:{id}` and `player-milestones:{id}`
 * tags so the next request (all locales, all edges) re-renders the profile,
 * its OG image, and JSON-LD from fresh Soroban data.
 */

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;

// Simple in-memory sliding-window rate limiter. Per-instance only; the indexer
// also dedupes per player, so this is a defence-in-depth guard against abuse.
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    hits.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to avoid leaking length via timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return constantTimeEqual(expected, signature);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'revalidation not configured' },
      { status: 503 },
    );
  }

  const clientKey =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(clientKey)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  const signature = req.headers.get('x-revalidate-signature');
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: { playerId?: unknown };
  try {
    payload = JSON.parse(rawBody) as { playerId?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const playerId =
    typeof payload.playerId === 'string' ? payload.playerId.trim() : '';
  if (!playerId) {
    return NextResponse.json({ error: 'missing playerId' }, { status: 400 });
  }

  revalidateTag(`player:${playerId}`);
  revalidateTag(`player-milestones:${playerId}`);

  return NextResponse.json({ revalidated: true, playerId });
}
