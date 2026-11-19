import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { getPlayer } from '@/lib/contract';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
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
  const ip = getClientIp(req);
  const limited = await rateLimit(`ipfs-superseded:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  const sessionWallet = await getSessionWallet();
  if (!sessionWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
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
    return NextResponse.json(
      { error: 'oldCid and playerId are required' },
      { status: 400 },
    );
  }

  const player = await getPlayer(playerId);
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  if (
    !player.wallet ||
    player.wallet.toLowerCase() !== sessionWallet.toLowerCase()
  ) {
    return NextResponse.json(
      { error: 'Forbidden: caller does not own this player' },
      { status: 403 },
    );
  }

  if (player.ipfsHash && player.ipfsHash === oldCid) {
    return NextResponse.json(
      { error: 'oldCid is still the current ipfsHash' },
      { status: 409 },
    );
  }

  const record = recordSupersededCid(oldCid, playerId);
  return NextResponse.json({ record }, { status: 201 });
}
