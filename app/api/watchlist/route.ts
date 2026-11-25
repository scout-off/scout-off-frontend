import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { WatchlistStore, MAX_WATCHLIST_ENTRIES } from '@/lib/watchlistStore';
import { isValidStellarAddress, normalizeStellarAddress } from '@/lib/stellar';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';
import { checkRateLimit } from '@/lib/rateLimit';

/** Issue #1716 caps for scouts' private watchlist notes and tags. */
export const WATCHLIST_NOTE_MAX_LENGTH = 1000;
export const WATCHLIST_MAX_TAGS = 10;
export const WATCHLIST_TAG_MAX_LENGTH = 32;

const WATCHLIST_PATCH_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

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
    const store = WatchlistStore.getInstance();

    // Enforce per-wallet cap before inserting (issue #1507).
    const current = store.count(scoutWallet);
    if (current >= MAX_WATCHLIST_ENTRIES) {
      return privateJson(
        {
          error: 'Watchlist limit reached',
          code: 'WATCHLIST_LIMIT_REACHED',
          limit: MAX_WATCHLIST_ENTRIES,
        },
        { status: 409 },
      );
    }

    const entry = store.add(scoutWallet, normalizedPlayerId);
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

/**
 * PATCH /api/watchlist
 *
 * Updates the private note and tags on one of the authenticated scout's
 * watchlist entries. Body: { id, note, tags }. Pass an empty string / array
 * to clear them. Entries owned by another scout return 404.
 */
export async function PATCH(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimit(
    `watchlist-patch:${scoutWallet}`,
    WATCHLIST_PATCH_RATE_LIMIT,
  );
  if (rl.limited) {
    return privateJson(
      { error: 'Too many requests. Please slow down.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) },
      },
    );
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, note, tags } = body as Record<string, unknown>;
  if (typeof id !== 'number') {
    return privateJson({ error: 'id must be a number' }, { status: 400 });
  }
  if (typeof note !== 'string' || note.length > WATCHLIST_NOTE_MAX_LENGTH) {
    return privateJson(
      {
        error: `note must be a string of at most ${WATCHLIST_NOTE_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(tags) ||
    tags.length > WATCHLIST_MAX_TAGS ||
    !tags.every(
      (t) =>
        typeof t === 'string' &&
        t.trim().length > 0 &&
        t.trim().length <= WATCHLIST_TAG_MAX_LENGTH,
    )
  ) {
    return privateJson(
      {
        error: `tags must be an array of at most ${WATCHLIST_MAX_TAGS} non-empty strings of at most ${WATCHLIST_TAG_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const uniqueTags = Array.from(
    new Set((tags as string[]).map((t) => t.trim())),
  );

  try {
    const entry = WatchlistStore.getInstance().updateNotes(
      scoutWallet,
      id,
      note.trim(),
      uniqueTags,
    );
    if (!entry) {
      return privateJson(
        { error: 'Watchlist entry not found' },
        { status: 404 },
      );
    }
    return privateJson(entry);
  } catch (err) {
    log.error('Failed to update watchlist entry', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to update watchlist entry' },
      { status: 500 },
    );
  }
}
