import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { createRequestLogger } from '@/lib/logger';
import { privateJson } from '@/lib/httpResponses';

export const runtime = 'nodejs';

/**
 * GET /api/notifications/read
 *
 * Lists the authenticated wallet's read notification ids.
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const ids = NotificationReadStore.getInstance().getReadIds(wallet);
    return privateJson({ ids });
  } catch (err) {
    log.error('Failed to list read notifications', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to load read notifications' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/notifications/read
 *
 * Marks notifications as read for the authenticated wallet.
 * Body: { ids: number[] }. Used for both "mark one" (single-element array)
 * and "mark all" (client passes every currently-unread id).
 */
export async function POST(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids } = body as Record<string, unknown>;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id) => typeof id === 'number' && Number.isFinite(id))
  ) {
    return privateJson(
      { error: 'ids must be a non-empty array of numbers' },
      { status: 400 },
    );
  }

  try {
    NotificationReadStore.getInstance().markRead(wallet, ids);
    return privateJson({ ok: true });
  } catch (err) {
    log.error('Failed to mark notifications read', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return privateJson(
      { error: 'Failed to mark notifications read' },
      { status: 500 },
    );
  }
}
