import type {
  AdminAuditActionType,
  AdminAuditQueryResult,
  ReconciliationResult,
  ReconciliationRun,
} from '@/lib/adminAudit';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

/** Client for app/api/admin/audit-log/* — same-origin, cookie-authenticated. */

export interface AuditLogQuery {
  actionType?: AdminAuditActionType;
  /** Unix seconds. */
  from?: number;
  /** Unix seconds. */
  to?: number;
  before?: number;
  limit?: number;
}

export async function fetchAuditLog(
  query: AuditLogQuery = {},
): Promise<AdminAuditQueryResult> {
  const params = new URLSearchParams();
  if (query.actionType) params.set('actionType', query.actionType);
  if (query.from !== undefined) params.set('from', String(query.from));
  if (query.to !== undefined) params.set('to', String(query.to));
  if (query.before !== undefined) params.set('before', String(query.before));
  if (query.limit !== undefined) params.set('limit', String(query.limit));

  const qs = params.toString();
  const res = await fetchWithRetry(`/api/admin/audit-log${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'Failed to fetch audit log',
    );
  }
  return res.json();
}

export interface RecordAuditEntryInput {
  actionType: AdminAuditActionType;
  target?: string;
  amountStroops?: number;
  txHash?: string;
  status: 'submitted' | 'confirmed' | 'failed';
  data?: Record<string, unknown>;
}

/**
 * Records one admin action right after it's signed and submitted. Errors
 * are deliberately swallowed by callers (see app/[locale]/admin/page.tsx) —
 * a failure to *log* an action must never block or roll back the action
 * itself, which has already gone on-chain by the time this is called.
 *
 * Deliberately a bare `fetch`, not `fetchWithRetry`: this is a POST with no
 * idempotency key, so an automatic retry after a lost response risks writing
 * a duplicate audit entry.
 */
export async function recordAuditEntry(
  input: RecordAuditEntryInput,
): Promise<void> {
  const res = await fetch('/api/admin/audit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to record audit log entry');
}

export async function fetchReconciliation(): Promise<ReconciliationResult> {
  const res = await fetchWithRetry('/api/admin/audit-log/reconcile');
  if (!res.ok) throw new Error('Failed to run reconciliation');
  return res.json();
}

/** Past reconciliation runs, newest first (issue #1188). */
export async function fetchReconciliationHistory(
  limit?: number,
): Promise<ReconciliationRun[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const res = await fetch(`/api/admin/audit-log/reconcile/history${qs}`);
  if (!res.ok) throw new Error('Failed to fetch reconciliation history');
  const body = await res.json();
  return body.runs;
}
