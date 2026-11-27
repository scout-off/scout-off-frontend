/**
 * Central rate-limit policy registry (#1474).
 *
 * Problem: Only a handful of routes call checkRateLimit directly and each
 * hand-rolls its own key format, limits, window length, and 429 response
 * body. Many state-changing or expensive routes have no throttling at all.
 *
 * This file is the single source of truth for every per-route rate-limit
 * policy. Routes import their named policy constant and pass it to the
 * shared `applyRateLimit` helper, which enforces a consistent 429 shape
 * (RFC 7807 problem+detail JSON, Retry-After header).
 *
 * Adding a new limit: add a `RateLimitPolicy` entry to `POLICIES` below,
 * then call `applyRateLimit(req, POLICIES.myRoute)` at the top of the
 * handler. No other changes needed.
 *
 * Key format convention: `<route-slug>:<ip>` — the slug keeps counters for
 * different routes isolated when they share a Redis namespace. When a
 * policy sets `identity` to include the wallet, the key becomes
 * `<route-slug>:<ip>:<wallet>` (or `<route-slug>:<wallet>` for wallet-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from './rateLimit';
import { getSessionWallet } from './session';

// Types and the POLICIES table live in an Edge-safe module (see there).
import { POLICIES, type RateLimitPolicy } from './rateLimitPolicyRegistry';

export * from './rateLimitPolicyRegistry';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Build the rate-limit key for a policy + request, honouring the policy's
 * `identity` dimension. Wallet is resolved via `getSessionWallet(req)`; when
 * a wallet-keyed policy is applied to an unauthenticated request we fall back
 * to IP-only so the request is still throttled.
 */
function buildKey(req: NextRequest, policy: RateLimitPolicy): string {
  const ip = getClientIp(req);
  const identity = policy.identity ?? 'ip';

  if (identity === 'ip') {
    return `${policy.slug}:${ip}`;
  }

  const wallet = getSessionWallet(req);
  if (!wallet) {
    // Unauthenticated caller on a wallet-keyed route: fall back to IP so the
    // request is still throttled rather than bypassing the limit entirely.
    return `${policy.slug}:${ip}`;
  }

  return identity === 'wallet'
    ? `${policy.slug}:${wallet}`
    : `${policy.slug}:${ip}:${wallet}`;
}

/**
 * Apply a rate-limit policy to an incoming request.
 *
 * Returns a `NextResponse` (HTTP 429) when the caller has exceeded the
 * policy, or `null` when the request may proceed. The 429 body is
 * `{ error, retryAfterSec }` and the response carries a `Retry-After` header.
 */
export async function applyRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  const key = buildKey(req, policy);
  const result = await checkRateLimit(key, {
    limit: policy.limit,
    windowMs: policy.windowMs,
    onStoreError: policy.onStoreError,
  });

  if (!result.limited) return null;

  const retryAfter = result.retryAfterSec ?? Math.ceil(policy.windowMs / 1000);
  return NextResponse.json(
    { error: policy.message, retryAfterSec: retryAfter },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  );
}
