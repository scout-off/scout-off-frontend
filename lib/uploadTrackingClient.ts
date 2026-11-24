/**
 * Client for app/api/uploads/track and app/api/uploads/track/match
 * (issue #1005). Unauthenticated, same-origin. Both calls are best-effort
 * from the caller's perspective: a failure to record/match tracking must
 * never block the upload or registration flow that triggered it — mirrors
 * lib/adminAuditClient.ts's `recordAuditEntry` fire-and-forget pattern for
 * the same reason (the thing being tracked has already happened by the
 * time the tracking call is made).
 */

export type UploadTrackingContext = 'player_onboarding_highlight_reel';

/** Records that a CID was just pinned, independent of whether the larger flow completes. */
export async function trackUploadedCid(params: {
  cid: string;
  wallet: string | null;
  context: UploadTrackingContext;
}): Promise<void> {
  try {
    await fetch('/api/uploads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // Best-effort — see file doc comment.
  }
}

/** Marks a previously-tracked CID as matched once the flow it belongs to completes. */
export async function matchTrackedUpload(params: {
  cid: string;
  txHash: string | null;
}): Promise<void> {
  try {
    await fetch('/api/uploads/track/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // Best-effort — see file doc comment.
  }
}
