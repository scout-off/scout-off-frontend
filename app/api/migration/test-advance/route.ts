/**
 * POST /api/migration/test-advance
 *
 * TEST-ONLY endpoint that back-dates a migration request's executeAfter to
 * the past so the cooling-off check in POST /api/migration/execute passes
 * immediately. This is the only practical way to exercise the execute path
 * in a browser-level E2E test without waiting 72 real hours.
 *
 * This route is disabled in production (returns 404).
 * It is intentionally NOT protected by session auth — the test runner needs
 * to call it from a plain request context, not from an authenticated page.
 *
 * Body: { requestId: string }
 */
import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { MigrationStore } from '@/lib/migrationStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Hard gate: never available in production builds.
  if (process.env.NODE_ENV === 'production') {
    return privateJson({ error: 'Not Found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId } = (body ?? {}) as Record<string, unknown>;
  if (typeof requestId !== 'string' || !requestId.trim()) {
    return privateJson({ error: 'requestId is required' }, { status: 400 });
  }

  const store = MigrationStore.getInstance();
  const migReq = store.get(requestId.trim());

  if (!migReq) {
    return privateJson(
      { error: 'Migration request not found' },
      { status: 404 },
    );
  }

  // Back-date executeAfter to 1 ms in the past so the cooling-off check
  // passes immediately on the very next call to POST /api/migration/execute.
  // We reach directly into the store's backing DB via the store's own
  // SQLite handle to avoid adding a method to the public API surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (store as any).db as import('better-sqlite3').Database;
  db.prepare(
    `UPDATE migration_requests SET execute_after = ? WHERE id = ?`,
  ).run(Date.now() - 1, requestId.trim());

  const updated = store.get(requestId.trim());
  return privateJson(updated);
}
