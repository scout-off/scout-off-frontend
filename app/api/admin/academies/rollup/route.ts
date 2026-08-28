import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { fetchApprovalCountsByWallets } from '@/lib/indexerClient';
import { requireAdminWallet } from '@/lib/adminAuth';
import type { Academy, AcademyMilestoneRollup } from '@/types';

/**
 * GET /api/admin/academies/rollup — academy-scoped milestone-approval
 * rollup (issue #1172). The one Next.js route that reaches both backend
 * services this feature needs: server/'s academy roster (wallet→academy,
 * with each member's `addedAt`) and the indexer's per-wallet approval
 * counts. Neither service can join against the other's DB directly (see
 * docs/academy-validator-model.md's "Academy milestone rollup" section), so
 * the join happens here.
 *
 * Query params:
 *  - rangeDays: number of days back from now, or "all" for all-time
 *    (default 30).
 */

const VALID_RANGE_DAYS = new Set([7, 30, 90, 365]);
const DAY_MS = 24 * 60 * 60 * 1000;

function parseRange(searchParams: URLSearchParams): {
  start: number;
  end: number;
} | null {
  const raw = searchParams.get('rangeDays') ?? '30';
  const end = Date.now();
  if (raw === 'all') return { start: 0, end };

  const days = Number(raw);
  if (!VALID_RANGE_DAYS.has(days)) return null;
  return { start: end - days * DAY_MS, end };
}

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const range = parseRange(req.nextUrl.searchParams);
  if (!range) {
    return NextResponse.json(
      { error: 'rangeDays must be one of 7, 30, 90, 365, or "all"' },
      { status: 400 },
    );
  }

  const academies: Academy[] = await api.get('/academies').then((r) => r.data);

  // Every member wallet across every academy, each with its own lower bound
  // (member.addedAt) so an approval from before this wallet joined its
  // academy doesn't get attributed to it — see getApprovalCountsForWallets's
  // doc comment (packages/indexer/src/db/eventStore.ts) for why this can't
  // also exclude approvals made *after* a wallet was removed.
  const wallets = academies.flatMap((a) =>
    a.members.map((m) => ({ wallet: m.wallet, since: m.addedAt })),
  );

  let counts: Record<string, number> = {};
  let indexerAvailable = true;
  if (wallets.length > 0) {
    try {
      const result = await fetchApprovalCountsByWallets(range, wallets);
      counts = result.counts;
    } catch {
      indexerAvailable = false;
    }
  }

  const rollup: AcademyMilestoneRollup = {
    range,
    indexerAvailable,
    academies: academies.map((a) => ({
      academyId: a.id,
      academyName: a.name,
      memberCount: a.members.length,
      approvedMilestones: indexerAvailable
        ? a.members.reduce((sum, m) => sum + (counts[m.wallet] ?? 0), 0)
        : null,
    })),
  };

  return NextResponse.json(rollup);
}
