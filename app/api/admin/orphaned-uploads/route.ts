import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';
import { unpinFromPinata } from '@/lib/pinataUnpin';

/**
 * A tracked upload (lib/uploadTrackingStore.ts) unmatched to a completed
 * registration for at least this long is treated as abandoned rather than
 * "still in progress" — long enough that a player mid-wizard (filling out
 * step 1/3 after uploading in step 2) is never caught by a false positive,
 * short enough that abuse doesn't sit unpinnable-and-forgotten for days.
 */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/admin/orphaned-uploads
 *
 * Lists tracked uploads (issue #1005) that are still unmatched to a
 * completed registration past the grace period — candidates for cleanup.
 * On-demand/admin-triggerable by design: this deployment has no scheduled
 * background-job infrastructure (see docs/fraud-detection.md's #1007
 * investigation, which found the same gap), so the actual unpinning job's
 * *scheduling* is out of scope here per the issue notes — this route and
 * its POST sibling below are the on-demand path that's in scope.
 */
export async function GET(req: NextRequest) {
  const sessionWallet = requireAdminWallet(req);
  if (!sessionWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const candidates =
    UploadTrackingStore.getInstance().getOrphanCandidates(ORPHAN_GRACE_MS);
  return NextResponse.json({ candidates, graceMs: ORPHAN_GRACE_MS });
}

/**
 * POST /api/admin/orphaned-uploads
 *
 * Admin-triggered cleanup: attempts to unpin every current orphan
 * candidate from Pinata (best-effort — lib/pinataUnpin.ts never throws)
 * and marks each attempted record `cleaned` regardless of whether the
 * unpin call itself succeeded, so a repeated run doesn't keep re-surfacing
 * the same already-handled rows (a CID already unpinned, or unpinned by
 * some other means, would otherwise show up forever).
 */
export async function POST(req: NextRequest) {
  const sessionWallet = requireAdminWallet(req);
  if (!sessionWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const store = UploadTrackingStore.getInstance();
  const candidates = store.getOrphanCandidates(ORPHAN_GRACE_MS);

  let unpinned = 0;
  let unpinFailed = 0;
  for (const candidate of candidates) {
    const result = await unpinFromPinata(candidate.cid);
    if (result.ok) unpinned++;
    else unpinFailed++;
    store.markCleaned(candidate.id);
  }

  return NextResponse.json({
    attempted: candidates.length,
    unpinned,
    unpinFailed,
  });
}
