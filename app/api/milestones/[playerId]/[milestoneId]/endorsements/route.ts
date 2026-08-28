import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { getPlayer, checkIsValidator } from '@/lib/contract';
import { fetchAcademyForWallet } from '@/lib/api';
import { MilestoneEndorsementStore } from '@/lib/milestoneEndorsementStore';
import type { Milestone, Player } from '@/types';

// better-sqlite3 (via lib/milestoneEndorsementStore.ts) is a native addon
// and needs the Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * GET /api/milestones/:playerId/:milestoneId/endorsements
 *
 * Public, unauthenticated — same "enrichment, not a gate" posture as
 * GET /academies/wallet/:wallet (see docs/academy-validator-model.md).
 * Returns every distinct wallet that has endorsed this milestone, so the
 * frontend can compute "N of M academy members" without also needing to
 * know the academy's roster or quorum itself (callers already have the
 * academy record from fetchAcademyForWallet).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { playerId: string; milestoneId: string } },
) {
  const endorsements = MilestoneEndorsementStore.getInstance().listFor(
    params.playerId,
    params.milestoneId,
  );
  return NextResponse.json({ endorsements });
}

/**
 * POST /api/milestones/:playerId/:milestoneId/endorsements
 *
 * Records the caller's own endorsement of a milestone (issue #1185) — an
 * off-chain-only attestation, never a call to the on-chain
 * `approve_milestone`. Requires:
 *
 * 1. A valid session (the caller must be signed in as the wallet endorsing —
 *    see lib/session.ts).
 * 2. The caller is a currently-authorized on-chain validator.
 * 3. The caller is a registered member of the SAME academy as the
 *    milestone's original approving validator (`milestone.validator`) —
 *    endorsing a milestone approved by an unrelated academy, or by no
 *    academy at all, isn't meaningful.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { playerId: string; milestoneId: string } },
) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isValidator = await checkIsValidator(wallet).catch(() => false);
  if (!isValidator) {
    return NextResponse.json(
      { error: 'Only authorized validators can endorse a milestone' },
      { status: 403 },
    );
  }

  let player: Player;
  try {
    player = (await getPlayer(params.playerId)) as Player;
  } catch {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const milestone = player.milestones.find(
    (m: Milestone) => m.id === params.milestoneId,
  );
  if (!milestone) {
    return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
  }

  const [callerAcademy, approverAcademy] = await Promise.all([
    fetchAcademyForWallet(wallet),
    fetchAcademyForWallet(milestone.validator),
  ]);

  if (
    !callerAcademy ||
    !approverAcademy ||
    callerAcademy.id !== approverAcademy.id
  ) {
    return NextResponse.json(
      {
        error:
          "Endorsing wallet must be a registered member of the same academy as the milestone's approving validator",
      },
      { status: 403 },
    );
  }

  MilestoneEndorsementStore.getInstance().add(
    params.playerId,
    params.milestoneId,
    wallet,
  );

  return NextResponse.json({ success: true });
}
