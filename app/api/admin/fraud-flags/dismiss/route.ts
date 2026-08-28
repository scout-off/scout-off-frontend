import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { computeFraudFlagDismissalKey } from '@/lib/fraudDetection';
import { FraudFlagDismissalStore } from '@/lib/fraudFlagDismissalStore';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { createRequestLogger } from '@/lib/logger';
import { sanitizeTextInput } from '@/lib/inputValidation';
import type { FraudFlagCategory, FraudFlagSeverity } from '@/types';

export const runtime = 'nodejs';

const NOTE_MAX = 500;

const CATEGORIES: FraudFlagCategory[] = ['referral', 'pay_to_contact'];
const SEVERITIES: FraudFlagSeverity[] = ['low', 'medium', 'high'];

function isFlagPayload(value: unknown): value is {
  category: FraudFlagCategory;
  heuristic: string;
  severity: FraudFlagSeverity;
  wallets: string[];
  reason: string;
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.category === 'string' &&
    (CATEGORIES as string[]).includes(v.category) &&
    typeof v.heuristic === 'string' &&
    v.heuristic.length > 0 &&
    typeof v.severity === 'string' &&
    (SEVERITIES as string[]).includes(v.severity) &&
    Array.isArray(v.wallets) &&
    v.wallets.length > 0 &&
    v.wallets.every((w) => typeof w === 'string' && w.length > 0) &&
    typeof v.reason === 'string'
  );
}

/**
 * POST /api/admin/fraud-flags/dismiss
 *
 * Persists an admin's decision that a specific, content-keyed fraud flag
 * (issue #1171) is reviewed and not actually abuse, so it stops
 * re-surfacing on subsequent GET /api/admin/fraud-flags loads. Body:
 * { flag: { category, heuristic, severity, wallets, reason }, note?: string }.
 *
 * The flag isn't looked up by a database id — heuristic output is
 * recomputed from scratch on every run and has no such id — so the client
 * posts back the flag it's dismissing (as rendered) and the server derives
 * the same stable key (`computeFraudFlagDismissalKey`,
 * lib/fraudDetection.ts) it will later recompute when filtering a fresh
 * evaluation. See docs/fraud-detection.md and lib/fraudFlagDismissalStore.ts.
 *
 * Every dismissal is also written to the existing admin audit log
 * (lib/adminAuditStore.ts) — who dismissed what, when, and why — reusing
 * that store's conventions directly rather than a separate, untracked
 * mechanism (acceptance criterion for #1171).
 */
export async function POST(req: NextRequest) {
  const adminWallet = requireAdminWallet(req);
  if (!adminWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { flag, note: rawNote } = body as Record<string, unknown>;
  if (!isFlagPayload(flag)) {
    return NextResponse.json(
      {
        error:
          'flag must include category, heuristic, severity, wallets, and reason',
      },
      { status: 400 },
    );
  }

  let note: string | undefined;
  if (rawNote !== undefined) {
    if (typeof rawNote !== 'string') {
      return NextResponse.json(
        { error: 'note must be a string' },
        { status: 400 },
      );
    }
    const sanitized = sanitizeTextInput(rawNote);
    if (sanitized.length > NOTE_MAX) {
      return NextResponse.json(
        { error: `note must be at most ${NOTE_MAX} characters` },
        { status: 400 },
      );
    }
    note = sanitized.length > 0 ? sanitized : undefined;
  }

  const flagKey = computeFraudFlagDismissalKey(flag);
  const log = createRequestLogger(req);

  try {
    const dismissal = FraudFlagDismissalStore.getInstance().dismiss({
      flagKey,
      category: flag.category,
      heuristic: flag.heuristic,
      severity: flag.severity,
      wallets: flag.wallets,
      flagReason: flag.reason,
      note,
      dismissedBy: adminWallet,
    });

    // Reuses lib/adminAuditStore.ts's existing admin-audit-log conventions
    // (same store, same shape) rather than a separate untracked mechanism —
    // fire-and-forget-safe here since it runs after the dismissal itself
    // already succeeded, but any failure is still logged and surfaced.
    try {
      AdminAuditStore.getInstance().insertEntry({
        actionType: 'fraud_flag_dismiss',
        adminWallet,
        target: flagKey,
        status: 'confirmed',
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          category: flag.category,
          heuristic: flag.heuristic,
          severity: flag.severity,
          wallets: flag.wallets,
          reason: flag.reason,
          note: note ?? null,
        },
      });
    } catch (auditErr) {
      log.error('Failed to write fraud flag dismissal to admin audit log', {
        reason:
          auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json(dismissal, { status: 201 });
  } catch (err) {
    log.error('Failed to dismiss fraud flag', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to dismiss fraud flag' },
      { status: 500 },
    );
  }
}
