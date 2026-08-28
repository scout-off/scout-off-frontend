import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { ReconciliationHistoryStore } from '@/lib/reconciliationHistoryStore';

// better-sqlite3 (via lib/reconciliationHistoryStore.ts) is a native addon
// and needs the Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * GET /api/admin/audit-log/reconcile/history
 *
 * Returns past reconciliation runs, newest first (issue #1188) — every run
 * GET /api/admin/audit-log/reconcile has ever produced, whether triggered
 * by an admin's open panel or an external scheduler, with enough detail
 * (mismatch types, counts, how many were newly-appearing) to reconstruct
 * what drift existed at each point in time. Powers AdminAuditLog.tsx's
 * history view, distinct from the single latest-run banner it already had.
 */
export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const runs = ReconciliationHistoryStore.getInstance().listRuns(
    limit && Number.isFinite(limit) && limit > 0 ? limit : undefined,
  );
  return NextResponse.json({ runs });
}
