/**
 * POST /api/migration/execute
 *
 * Executes a migration request whose cooling-off period has elapsed.
 * Only the toWallet (destination/backup wallet) may trigger execution.
 *
 * Body: { requestId: string }
 *
 * On success: all off-chain stores keyed by fromWallet are moved to toWallet,
 * fromWallet's sessions are revoked, and the request is marked 'completed'.
 * On failure: the request is marked 'failed' with the error reason.
 *
 * On-chain identity transfer is explicitly NOT performed — the contract does
 * not yet expose a transfer_player entrypoint. The response includes a
 * notice explaining this limitation.
 */
import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/httpResponses';
import { getSessionWallet } from '@/lib/session';
import { MigrationStore, COOLING_OFF_MS } from '@/lib/migrationStore';
import { executeWalletMigration } from '@/lib/walletMigration';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const log = createRequestLogger(req);

  const wallet = getSessionWallet(req);
  if (!wallet) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
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

  // Only the destination wallet may execute
  if (migReq.toWallet !== wallet) {
    return privateJson(
      {
        error:
          'Forbidden: only the destination wallet may execute this migration',
      },
      { status: 403 },
    );
  }

  if (migReq.status === 'cancelled') {
    return privateJson(
      { error: 'This migration request has been cancelled' },
      { status: 409 },
    );
  }
  if (migReq.status === 'completed') {
    return privateJson(
      { error: 'This migration has already been completed' },
      { status: 409 },
    );
  }
  if (migReq.status === 'failed') {
    return privateJson(
      { error: 'This migration failed. Please submit a new request.' },
      { status: 409 },
    );
  }
  if (migReq.status !== 'pending') {
    return privateJson(
      { error: `Cannot execute migration in status '${migReq.status}'` },
      { status: 409 },
    );
  }

  // Enforce cooling-off period
  const now = Date.now();
  if (now < migReq.executeAfter) {
    const remainingMs = migReq.executeAfter - now;
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return privateJson(
      {
        error: `Cooling-off period has not elapsed. Please wait ${remainingHours} more hour(s) before executing.`,
        executeAfter: migReq.executeAfter,
        remainingMs,
      },
      { status: 425 }, // Too Early
    );
  }

  log.info('Executing wallet migration', {
    id: migReq.id,
    fromWallet: migReq.fromWallet,
    toWallet: migReq.toWallet,
  });

  try {
    const result = await executeWalletMigration(
      migReq.fromWallet,
      migReq.toWallet,
    );
    const completed = store.markCompleted(migReq.id);

    log.info('Wallet migration completed', {
      id: migReq.id,
      counts: result.counts,
    });

    return privateJson({
      request: completed,
      migration: result,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error('Wallet migration failed', { id: migReq.id, reason });
    store.markFailed(migReq.id, reason);
    return privateJson(
      { error: `Migration failed: ${reason}` },
      { status: 500 },
    );
  }
}
