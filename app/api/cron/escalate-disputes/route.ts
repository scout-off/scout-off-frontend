import { NextRequest, NextResponse } from 'next/server';
import { MilestoneDisputeStore } from '@/lib/milestoneDisputeStore';
import { createRequestLogger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/cronAuth';

export const runtime = 'nodejs';

/**
 * GET /api/cron/escalate-disputes
 *
 * Scheduled cron job (e.g. daily) that marks every 'pending' dispute whose
 * response deadline has elapsed as 'escalated', records a system event on
 * each dispute's timeline, and returns a count.
 *
 * Authorization: see lib/cronAuth.ts — uses CRON_SECRET (fail-closed) with
 * a constant-time comparison (#1490). Previously this route wrapped its auth
 * check in `if (cronSecret) { ... }`, so an unconfigured secret meant the
 * route was fully open to unauthenticated callers.
 *
 * Vercel cron schedule (add to vercel.json):
 *   { "path": "/api/cron/escalate-disputes", "schedule": "0 2 * * *" }
 * (runs at 02:00 UTC daily)
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  const log = createRequestLogger(req);
  try {
    const store = MilestoneDisputeStore.getInstance();
    const count = store.escalateUnanswered();
    log.info('Escalated unanswered disputes', { count });
    return NextResponse.json({ escalated: count });
  } catch (err) {
    log.error('Failed to escalate disputes', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to escalate disputes' },
      { status: 500 },
    );
  }
}
