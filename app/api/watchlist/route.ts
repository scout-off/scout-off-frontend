import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { WatchlistStore } from '@/lib/watchlistStore';
import { isValidStellarAddress, normalizeStellarAddress } from '@/lib/stellar';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/watchlist
 *
 * Lists the authenticated scout's watchlisted players.
 */
export async function GET(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const entries = WatchlistStore.getInstance().list(scoutWallet);
    return privateJson(entries);
  } catch (err) {
    log.error('Failed to list watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson({ error: 'Failed to load watchlist' }, { status: 500 });
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
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { playerId } = body as Record<string, unknown>;
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return privateJson(
      { error: 'playerId must be a non-empty string' },
      { status: 400 },
    );
  }

  // Normalize first (case-fold) so a validly-keyed address submitted in
  // lower/mixed case is accepted and stored in one canonical form, then
  // gate on real Ed25519 validity.
  const normalizedPlayerId = normalizeStellarAddress(playerId);
  if (!isValidStellarAddress(normalizedPlayerId)) {
    return privateJson(
      { error: 'playerId must be a valid Stellar public key (G...)' },
      { status: 400 },
    );
  }

  try {
    const entry = WatchlistStore.getInstance().add(
      scoutWallet,
      normalizedPlayerId,
    );
    return privateJson(entry, { status: 201 });
  } catch (err) {
    log.error('Failed to add to watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
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
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'number') {
    return privateJson({ error: 'id must be a number' }, { status: 400 });
  }

  try {
    const removed = WatchlistStore.getInstance().remove(scoutWallet, id);
    if (!removed) {
      return privateJson(
        { error: 'Watchlist entry not found' },
        { status: 404 },
      );
    }
    return privateJson({ success: true });
  } catch (err) {
    log.error('Failed to remove from watchlist', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to remove from watchlist' },
      { status: 500 },
    );
  }
}
