import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { RecentlyViewedStore } from '@/lib/recentlyViewedStore';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/recently-viewed
 *
 * Lists the authenticated scout's recently viewed players.
 */
export async function GET(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const entries = RecentlyViewedStore.getInstance().list(scoutWallet);
    return privateJson(entries);
  } catch (err) {
    log.error('Failed to list recently viewed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to load recently viewed' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/recently-viewed
 *
 * Records a player view. Body: { playerId, viewedAt }.
 * viewedAt is a Unix ms timestamp (optional, defaults to now).
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

  const { playerId, viewedAt } = body as Record<string, unknown>;
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return privateJson(
      { error: 'playerId must be a non-empty string' },
      { status: 400 },
    );
  }

  const timestamp = typeof viewedAt === 'number' ? viewedAt : Date.now();

  try {
    const entry = RecentlyViewedStore.getInstance().record(
      scoutWallet,
      playerId,
      timestamp,
    );
    return privateJson(entry, { status: 201 });
  } catch (err) {
    log.error('Failed to record view', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson({ error: 'Failed to record view' }, { status: 500 });
  }
}

/**
 * DELETE /api/recently-viewed
 *
 * Removes an entry from the authenticated scout's recently viewed list.
 * Body: { id }.
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
    const removed = RecentlyViewedStore.getInstance().remove(
      scoutWallet,
      id as number,
    );
    if (!removed) {
      return privateJson(
        { error: 'Recently viewed entry not found' },
        { status: 404 },
      );
    }
    return privateJson({ success: true });
  } catch (err) {
    log.error('Failed to remove view', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson({ error: 'Failed to remove view' }, { status: 500 });
  }
}
