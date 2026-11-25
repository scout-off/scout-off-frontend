import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHmac } from 'crypto';

/**
 * Fail-closed cron authentication helper (#1490).
 *
 * Both cron routes previously diverged on how they handled an unset
 * CRON_SECRET:
 *   - app/api/cron/fraud-flags/route.ts  → 500 when unset (correct)
 *   - app/api/cron/escalate-disputes/route.ts → skipped the check entirely
 *     when unset, letting anyone trigger dispute escalation (wrong)
 *
 * Both also compared the Authorization header with `!==` (string equality),
 * which leaks timing information. This helper fixes both issues in one place:
 *
 *   1. Returns a 500 when CRON_SECRET is not configured (fail-closed).
 *   2. Uses `timingSafeEqual` for the header comparison.
 *   3. Enforces the `Bearer <secret>` scheme.
 *
 * Usage in a cron route:
 *
 *   const authError = verifyCronRequest(req);
 *   if (authError) return authError;
 *
 * Returns null when the request is authorized, or a NextResponse (403/500) to
 * be returned immediately when it is not.
 */
export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${configuredSecret}`;

  // Use constant-time comparison to prevent timing-based secret recovery.
  // Both buffers must be the same length for timingSafeEqual; if they differ in
  // length, the request is rejected outright without leaking timing information
  // about the expected value's length.
  const providedBuf = Uint8Array.from(Buffer.from(authHeader));
  const expectedBuf = Uint8Array.from(Buffer.from(expected));
  const authorized =
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf);

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

/**
 * Constant-time string comparison that does not leak length information.
 * Returns false when either value is empty.
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Uint8Array.from(Buffer.from(a));
  const bBuf = Uint8Array.from(Buffer.from(b));
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify an HMAC-signed webhook body (#1672).
 *
 * The indexer signs the raw request body with `REVALIDATE_SECRET` and sends
 * the hex digest in the `x-revalidate-signature` header. We recompute the
 * digest over the raw body and compare in constant time.
 *
 * Returns null when the request is authorized, or a NextResponse (401/500) to
 * be returned immediately when it is not.
 */
export function verifyHmacSignature(
  rawBody: string,
  signature: string | null,
): NextResponse | null {
  const configuredSecret = process.env.REVALIDATE_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'REVALIDATE_SECRET is not configured' },
      { status: 500 },
    );
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const expected = createHmac('sha256', configuredSecret)
    .update(rawBody)
    .digest('hex');

  if (!safeEqual(signature, expected)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  return null;
}
