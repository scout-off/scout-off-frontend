import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { createRequestLogger } from '@/lib/logger';
import type { PlayerFilter } from '@/types';

export const runtime = 'nodejs';

/**
 * GET /api/saved-searches
 *
 * Lists the authenticated scout's saved searches.
 */
export async function GET(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const entries = SavedSearchStore.getInstance().list(scoutWallet);
    return NextResponse.json(entries);
  } catch (err) {
    log.error('Failed to list saved searches', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load saved searches' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/saved-searches
 *
 * Saves a search for the authenticated scout. Body: { name, filter }.
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

  const { name, filter } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'name must be a non-empty string' },
      { status: 400 },
    );
  }
  if (!filter || typeof filter !== 'object') {
    return NextResponse.json(
      { error: 'filter must be an object' },
      { status: 400 },
    );
  }

  try {
    const entry = SavedSearchStore.getInstance().add(
      scoutWallet,
      name.trim(),
      filter as PlayerFilter,
    );
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    log.error('Failed to save search', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to save search' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/saved-searches
 *
 * Renames a saved search for the authenticated scout. Body: { id, name }.
 */
export async function PATCH(req: NextRequest) {
  const scoutWallet = getSessionWallet(req);
  if (!scoutWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, name } = body as Record<string, unknown>;
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id must be a number' }, { status: 400 });
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'name must be a non-empty string' },
      { status: 400 },
    );
  }

  try {
    const updated = SavedSearchStore.getInstance().rename(
      scoutWallet,
      id,
      name.trim(),
    );
    if (!updated) {
      return NextResponse.json(
        { error: 'Saved search not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (err) {
    log.error('Failed to rename saved search', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to rename saved search' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/saved-searches
 *
 * Removes a saved search for the authenticated scout. Body: { id }.
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
    const removed = SavedSearchStore.getInstance().remove(scoutWallet, id);
    if (!removed) {
      return NextResponse.json(
        { error: 'Saved search not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('Failed to remove saved search', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to remove saved search' },
      { status: 500 },
    );
  }
}
