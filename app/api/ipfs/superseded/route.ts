import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { getSessionWallet } from '@/lib/session';
import { getPlayer } from '@/lib/contract';
import { applyRateLimit, POLICIES } from '@/lib/rateLimitPolicies';
import { recordSupersededCid } from '@/lib/supersededMediaStore';

/**
 * Records a CID as superseded so the admin cleanup run can unpin it from
 * Pinata after the grace period.
 *
 * Security (issue #1284): this route used to be fully open, which let anyone
 * schedule any player's live media for unpinning. It now requires an
 * authenticated session whose wallet is the on-chain owner of `playerId`,
 * and refuses to record a CID that is still the player's current `ipfsHash`.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, POLICIES.ipfsSuperseded);
  if (limited) return limited;

  const sessionWallet = getSessionWallet(req);
  if (!sessionWallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { oldCid, playerId } = (body ?? {}) as {
    oldCid?: unknown;
    playerId?: unknown;
  };

  if (
    typeof oldCid !== 'string' ||
    oldCid.trim() === '' ||
    typeof playerId !== 'string' ||
    playerId.trim() === ''
  ) {
    return privateJson(
      { error: 'oldCid and playerId are required' },
      { status: 400 },
    );
  }

  const player = await getPlayer(playerId);
  if (!player) {
    return privateJson({ error: 'Player not found' }, { status: 404 });
  }

  if (
    !player.wallet ||
    player.wallet.toLowerCase() !== sessionWallet.toLowerCase()
  ) {
    return privateJson(
      { error: 'Forbidden: caller does not own this player' },
      { status: 403 },
    );
  }

  if (player.ipfsHash && player.ipfsHash === oldCid) {
    return privateJson(
      { error: 'oldCid is still the current ipfsHash' },
      { status: 409 },
    );
  }

  const record = recordSupersededCid(oldCid, playerId);
  return privateJson({ id: record.id, record }, { status: 201 });
}
