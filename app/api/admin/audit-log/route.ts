import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { isAdminAuditActionType } from '@/lib/adminAudit';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/admin/audit-log?actionType=&from=&to=&before=&limit=
 *
 * Lists recorded admin actions (validator add/remove, fee withdrawal,
 * pause/unpause), filterable by action type and time range — the
 * "searchable ... audit view" acceptance criterion for issue #670. See
 * docs/admin-audit-log.md for the full design, including how this relates
 * to reconciliation at /api/admin/audit-log/reconcile.
 */
export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const params = req.nextUrl.searchParams;

  const actionTypeParam = params.get('actionType');
  if (actionTypeParam !== null && !isAdminAuditActionType(actionTypeParam)) {
    return NextResponse.json(
      { error: `Unknown actionType: ${actionTypeParam}` },
      { status: 400 },
    );
  }

  const parseIntParam = (name: string): number | undefined => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    const store = AdminAuditStore.getInstance();
    const result = store.getEntries({
      actionType: actionTypeParam ?? undefined,
      from: parseIntParam('from'),
      to: parseIntParam('to'),
      before: parseIntParam('before'),
      limit: parseIntParam('limit'),
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error('Failed to query admin audit log', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load audit log' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/audit-log
 *
 * Records one admin action. Called by the admin panel immediately after an
 * action is signed and submitted (see app/[locale]/admin/page.tsx's
 * execAction) — this is the *frontend-originated* half of the audit trail.
 * The other half (on-chain truth, which also captures actions taken outside
 * the frontend e.g. via the Soroban CLI) is read directly from the contract
 * / the indexer at reconcile time, not recorded here.
 */
export async function POST(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { actionType, target, amountStroops, txHash, status, data } =
    body as Record<string, unknown>;

  if (!isAdminAuditActionType(actionType)) {
    return NextResponse.json(
      { error: `actionType must be one of the known admin action types` },
      { status: 400 },
    );
  }
  if (status !== 'submitted' && status !== 'confirmed' && status !== 'failed') {
    return NextResponse.json(
      { error: 'status must be "submitted", "confirmed", or "failed"' },
      { status: 400 },
    );
  }

  try {
    const store = AdminAuditStore.getInstance();
    const entry = store.insertEntry({
      actionType,
      adminWallet: admin,
      target: typeof target === 'string' ? target : null,
      amountStroops: typeof amountStroops === 'number' ? amountStroops : null,
      txHash: typeof txHash === 'string' ? txHash : null,
      status,
      timestamp: Math.floor(Date.now() / 1000),
      data:
        data && typeof data === 'object'
          ? (data as Record<string, unknown>)
          : {},
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    log.error('Failed to record admin audit log entry', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to record audit log entry' },
      { status: 500 },
    );
  }
}
