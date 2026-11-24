import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';

const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 1000;

/**
 * POST /api/uploads/track/match
 *
 * Marks a previously-tracked upload (POST /api/uploads/track) as matched
 * once its registration actually completes — called by
 * PlayerOnboardingWizard.tsx right after `signAndSubmit` resolves
 * successfully in handleSubmit. A CID that's never matched here stays a
 * cleanup candidate past the grace period (issue #1005) —
 * see GET /api/admin/orphaned-uploads.
 *
 * Same unauthenticated posture as POST /api/uploads/track: this only ever
 * marks a *pending* record as matched, it can't fabricate a match for a
 * record that doesn't exist, so there's nothing here for an unauthenticated
 * caller to usefully abuse beyond noise (rate-limited like the sibling
 * route).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`upload-track-match:${ip}`, {
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (rl.limited) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cid, txHash } = (body ?? {}) as Record<string, unknown>;
  if (typeof cid !== 'string' || !cid.trim()) {
    return NextResponse.json({ error: 'cid is required' }, { status: 400 });
  }

  const matched = UploadTrackingStore.getInstance().markMatched(
    cid,
    typeof txHash === 'string' && txHash ? txHash : null,
  );

  if (!matched) {
    return NextResponse.json(
      { error: 'No pending tracked upload found for this cid' },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: matched.id, matchedAt: matched.matchedAt });
}
