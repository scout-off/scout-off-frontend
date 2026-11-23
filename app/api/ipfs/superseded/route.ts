/**
 * POST /api/ipfs/superseded
 *
 * Records an IPFS CID as superseded (replaced by a newer upload for the same
 * player). This endpoint is called server-side from the profile update flow —
 * NOT from the browser client — so Pinata credentials never leave the server.
 *
 * ─── When to call this endpoint ────────────────────────────────────────────
 * This should be invoked immediately after a successful profile update that
 * replaces an existing IPFS CID. The integration point is the server-side
 * action that calls lib/contract.ts's `buildUpdateProfile`:
 *
 *   buildUpdateProfile(wallet, playerId, newIpfsHash)
 *     → on success, POST /api/ipfs/superseded { oldCid, playerId }
 *
 * The actual hook-level integration (e.g., inside usePlayer or a server
 * action wrapping buildUpdateProfile) is left as a follow-up to avoid
 * touching the contract layer in this PR. See issue #1006 for details.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Request body:  { oldCid: string; playerId: string }
 * Response:      { id: string }   — the record ID for the superseded entry
 *
 * The created record becomes eligible for Pinata unpinning after the 72-hour
 * grace period elapses (see lib/supersededMediaStore.ts). Cleanup is triggered
 * by an admin via POST /api/admin/ipfs-cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordSupersededCid } from '@/lib/supersededMediaStore';

export interface SupersededRequestBody {
  oldCid: string;
  playerId: string;
}

export async function POST(req: NextRequest) {
  let body: Partial<SupersededRequestBody>;
  try {
    body = (await req.json()) as Partial<SupersededRequestBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { oldCid, playerId } = body ?? {};

  if (!oldCid || typeof oldCid !== 'string' || oldCid.trim() === '') {
    return NextResponse.json({ error: 'oldCid is required' }, { status: 400 });
  }
  if (!playerId || typeof playerId !== 'string' || playerId.trim() === '') {
    return NextResponse.json(
      { error: 'playerId is required' },
      { status: 400 },
    );
  }

  const record = recordSupersededCid(oldCid.trim(), playerId.trim());
  return NextResponse.json({ id: record.id }, { status: 201 });
}
