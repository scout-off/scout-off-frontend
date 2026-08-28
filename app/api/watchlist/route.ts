import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { WatchlistStore } from '@/lib/watchlistStore';
import { isValidStellarAddress, normalizeStellarAddress } from '@/lib/stellar';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/watchlist
 *
 * Lists the authenticated scout's watchlisted players.
 */
export async function GET(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const entries = WatchlistStore.getInstance().list(scoutWallet);
    return NextResponse.json(entries);
  } catch (err) {
    log.error('Failed to list watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load watchlist' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/watchlist
 *
 * Adds a player to the authenticated scout's watchlist. Body: { playerId }.
 */
export async function POST(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { playerId } = body as Record<string, unknown>;
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return NextResponse.json(
      { error: 'playerId must be a non-empty string' },
      { status: 400 },
    );
  }

  // Validate that playerId is a valid Stellar public key
  if (!isValidStellarAddress(playerId)) {
    return NextResponse.json(
      { error: 'playerId must be a valid Stellar public key (G...)' },
      { status: 400 },
    );
  }

  // Normalize the address to uppercase to ensure consistent storage and lookup
  const normalizedPlayerId = normalizeStellarAddress(playerId);

  try {
    const entry = WatchlistStore.getInstance().add(scoutWallet, normalizedPlayerId);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    log.error('Failed to add to watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to add to watchlist' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/watchlist
 *
 * Removes an entry from the authenticated scout's watchlist. Body: { id }.
 */
export async function DELETE(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id must be a number' }, { status: 400 });
  }

  try {
    const removed = WatchlistStore.getInstance().remove(scoutWallet, id);
    if (!removed) {
      return NextResponse.json(
        { error: 'Watchlist entry not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('Failed to remove from watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to remove from watchlist' },
      { status: 500 },
    );
  }
}
