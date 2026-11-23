import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  UploadTrackingStore,
  type UploadTrackingContext,
} from '@/lib/uploadTrackingStore';

const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 1000;

const ALLOWED_CONTEXTS: UploadTrackingContext[] = [
  'player_onboarding_highlight_reel',
];

/**
 * POST /api/uploads/track
 *
 * Records that a client upload flow pinned a CID, independent of whether
 * that flow's larger goal (e.g. player registration) ever completes
 * (issue #1005). Called by PlayerOnboardingWizard.tsx the moment
 * VideoUpload's onUpload fires with a CID — before the registration
 * transaction exists, let alone gets signed.
 *
 * Unauthenticated like the upload routes themselves
 * (app/api/ipfs/upload/route.ts) — no session exists yet at this point in
 * onboarding. `wallet` is client-reported and used only for matching
 * convenience and admin triage, not as an access-control boundary; nothing
 * here grants or checks any permission.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`upload-track:${ip}`, {
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

  const { cid, wallet, context } = (body ?? {}) as Record<string, unknown>;

  if (typeof cid !== 'string' || !cid.trim()) {
    return NextResponse.json({ error: 'cid is required' }, { status: 400 });
  }
  if (
    typeof context !== 'string' ||
    !ALLOWED_CONTEXTS.includes(context as UploadTrackingContext)
  ) {
    return NextResponse.json(
      { error: `context must be one of: ${ALLOWED_CONTEXTS.join(', ')}` },
      { status: 400 },
    );
  }

  const record = UploadTrackingStore.getInstance().recordUpload({
    cid,
    wallet: typeof wallet === 'string' && wallet ? wallet : null,
    context: context as UploadTrackingContext,
  });

  return NextResponse.json({ id: record.id }, { status: 201 });
}
