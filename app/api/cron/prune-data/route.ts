import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { SessionStore } from '@/lib/sessionStore';
import { ChunkedUploadChunkStore } from '@/lib/chunkedUploadChunkStore';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';

/**
 * Scheduled data-retention / pruning job (issue #1477).
 *
 * Problem: expired sessions, abandoned chunked-upload chunks, old
 * notification-read rows and unmatched upload-tracking rows accumulate
 * forever — both a storage-cost problem and a privacy-policy problem.
 *
 * This route is designed to be called by Vercel Cron (see vercel.json's
 * `crons` entry).  It is authorized by the same `CRON_SECRET` bearer-token
 * pattern used by the existing /api/cron/fraud-flags route.
 *
 * What gets pruned
 * ────────────────
 * 1. Sessions (SessionStore / sessions.db)
 *    Rows where `expires_at < now` OR `revoked_at IS NOT NULL` older than
 *    the audit retention window (30 days after revocation) are hard-deleted.
 *    Active sessions are never touched.
 *
 * 2. Chunked-upload chunks (ChunkedUploadChunkStore / chunked-uploads.db)
 *    Chunk bytes whose `created_at` is older than SESSION_TTL_MS + a 1-hour
 *    grace period are deleted.  By the time a chunk reaches that age its
 *    session metadata has already expired and the bytes are unreachable.
 *
 * 3. Notification reads (NotificationReadStore / notification-reads.db)
 *    Read-state rows older than NOTIFICATION_READ_RETENTION_MS (90 days).
 *    A wallet that hasn't acted on a notification in 90 days will simply see
 *    it as unread again — an acceptable, minor UX tradeoff for bounded
 *    storage.
 *
 * 4. Upload-tracking rows (UploadTrackingStore / tracked-uploads.db)
 *    Rows where `cleaned_at IS NOT NULL` and are older than 30 days (already
 *    acknowledged by admin), and unmatched rows older than
 *    UNMATCHED_UPLOAD_RETENTION_MS (30 days) that have never been claimed by
 *    any on-chain registration.
 *
 * Authorization
 * ─────────────
 * Same as /api/cron/fraud-flags: requires `Authorization: Bearer ${CRON_SECRET}`.
 * The route returns 500 when CRON_SECRET is unconfigured rather than
 * silently allowing unauthenticated pruning runs.
 */

// Keep revoked/expired session rows for 30 days for audit purposes.
const SESSION_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// 2-hour upload-session TTL (matches SESSION_TTL_MS in chunkedUploadStore.ts)
// plus 1 hour grace before deleting orphaned chunk bytes.
const CHUNK_ORPHAN_THRESHOLD_MS = (2 + 1) * 60 * 60 * 1000;
// Notification reads older than 90 days are pruned.
const NOTIFICATION_READ_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
// Upload-tracking rows older than 30 days are pruned (matched+cleaned or
// unmatched with no subsequent on-chain activity).
const UPLOAD_TRACKING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface PruneResult {
  sessionsDeleted: number;
  chunkRowsDeleted: number;
  notificationReadsDeleted: number;
  uploadTrackingRowsDeleted: number;
  durationMs: number;
  prunedAt: string;
}

async function runPruning(): Promise<PruneResult> {
  const start = Date.now();
  const now = Date.now();

  // ── 1. Sessions ────────────────────────────────────────────────────────────
  const sessionStore = SessionStore.getInstance();
  const sessionsDeleted = sessionStore.pruneExpiredAndRevoked(
    now,
    SESSION_AUDIT_RETENTION_MS,
  );

  // ── 2. Orphaned chunk bytes ────────────────────────────────────────────────
  const chunkStore = ChunkedUploadChunkStore.getInstance();
  const chunkRowsDeleted = chunkStore.pruneOlderThan(
    now - CHUNK_ORPHAN_THRESHOLD_MS,
  );

  // ── 3. Old notification-read rows ─────────────────────────────────────────
  const notifStore = NotificationReadStore.getInstance();
  const notificationReadsDeleted = notifStore.pruneOlderThan(
    now - NOTIFICATION_READ_RETENTION_MS,
  );

  // ── 4. Upload-tracking rows ────────────────────────────────────────────────
  const uploadStore = UploadTrackingStore.getInstance();
  const uploadTrackingRowsDeleted = uploadStore.pruneOlderThan(
    now - UPLOAD_TRACKING_RETENTION_MS,
  );

  return {
    sessionsDeleted,
    chunkRowsDeleted,
    notificationReadsDeleted,
    uploadTrackingRowsDeleted,
    durationMs: Date.now() - start,
    prunedAt: new Date(now).toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return privateJson(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return privateJson({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await runPruning();
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'data-retention prune completed',
        ...result,
      }),
    );
    return privateJson({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'data-retention prune failed',
        error: message,
      }),
    );
    return privateJson({ error: 'Prune job failed', detail: message }, { status: 500 });
  }
}
