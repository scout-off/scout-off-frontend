import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { runFraudFlagEvaluation } from '@/lib/fraudFlagsRunner';
import { FraudFlagsStore } from '@/lib/fraudFlagsStore';
import { FraudFlagDismissalStore } from '@/lib/fraudFlagDismissalStore';
import { computeFraudFlagDismissalKey } from '@/lib/fraudDetection';

export async function GET(req: NextRequest) {
  const sessionWallet = requireAdminWallet(req);

  if (!sessionWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { flags, warnings } = await runFraudFlagEvaluation();
  const evaluatedAt = Date.now();
  // Every flag is still computed and persisted in full (docs/fraud-detection.md,
  // issue #1171) — the run history and staleness badge stay accurate to what
  // was actually evaluated. Dismissals only filter what's *rendered* below,
  // so a worsening pattern (a different or higher-severity key, see
  // computeFraudFlagDismissalKey) is never hidden by a stale dismissal of an
  // earlier, milder finding.
  FraudFlagsStore.getInstance().recordRun('manual', flags, warnings, evaluatedAt);

  const dismissedKeys = FraudFlagDismissalStore.getInstance().getDismissedKeys();
  const visibleFlags =
    dismissedKeys.size === 0
      ? flags
      : flags.filter(
          (flag) => !dismissedKeys.has(computeFraudFlagDismissalKey(flag)),
        );

  return NextResponse.json({
    flags: visibleFlags,
    warnings,
    evaluatedAt,
  });
}
