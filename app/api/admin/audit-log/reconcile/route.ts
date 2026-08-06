import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { AdminAuditStore } from '@/lib/adminAuditStore';
import { getValidators, getContractPaused } from '@/lib/contract';
import { fetchEvents } from '@/lib/indexerClient';
import { createRequestLogger } from '@/lib/logger';
import type {
  AdminAuditEntry,
  ReconciliationMismatch,
  ReconciliationResult,
} from '@/lib/adminAudit';

export const runtime = 'nodejs';

/** 1 XLM = 10,000,000 stroops (see lib/contract.ts's getPlatformFees doc comment). */
const STROOPS_PER_XLM = 10_000_000;

/**
 * Fee-withdrawal audit entries younger than this are not yet flagged as
 * "missing on-chain effect" — the indexer polls on an interval, so a very
 * recent submission may legitimately not have been indexed yet. Keeps the
 * reconciliation from crying wolf on its own in-flight actions.
 */
const INDEXER_LAG_GRACE_SECONDS = 5 * 60;

/**
 * Replays validator_add/validator_remove audit entries (oldest first) into
 * the validator set the log implies should currently exist.
 */
function expectedValidatorSetFromLog(entries: AdminAuditEntry[]): Set<string> {
  const set = new Set<string>();
  for (const entry of entries) {
    if (!entry.target) continue;
    if (entry.actionType === 'validator_add') set.add(entry.target);
    else if (entry.actionType === 'validator_remove') set.delete(entry.target);
  }
  return set;
}

async function reconcileValidators(
  store: AdminAuditStore,
): Promise<ReconciliationMismatch[]> {
  const [onChainValidators, logEntries] = await Promise.all([
    getValidators(),
    Promise.resolve(
      store.getAllByActionTypeOldestFirst([
        'validator_add',
        'validator_remove',
      ]),
    ),
  ]);

  const onChainSet = new Set(onChainValidators.map((v) => v.address));
  const expectedSet = expectedValidatorSetFromLog(logEntries);

  const mismatches: ReconciliationMismatch[] = [];

  for (const address of onChainSet) {
    if (!expectedSet.has(address)) {
      mismatches.push({
        actionType: 'validator_add',
        kind: 'missing_audit_entry',
        target: address,
        description: `${address} is an authorized validator on-chain, but the audit log has no record of it being added — likely added via a direct contract call outside the admin panel.`,
      });
    }
  }

  for (const address of expectedSet) {
    if (!onChainSet.has(address)) {
      mismatches.push({
        actionType: 'validator_remove',
        kind: 'missing_onchain_effect',
        target: address,
        description: `The audit log shows ${address} was added and not since removed, but it is not currently an authorized validator on-chain — it may have been removed via a direct contract call, or the recorded add transaction failed.`,
      });
    }
  }

  return mismatches;
}

async function reconcilePauseState(
  store: AdminAuditStore,
): Promise<ReconciliationMismatch[]> {
  const [onChainPaused, logEntries] = await Promise.all([
    getContractPaused(),
    Promise.resolve(store.getAllByActionTypeOldestFirst(['pause', 'unpause'])),
  ]);

  if (logEntries.length === 0) {
    // No frontend-recorded pause history at all. Only worth flagging if the
    // contract is actually paused right now — an unpaused contract with no
    // history is just "never touched," not a mismatch.
    if (onChainPaused) {
      return [
        {
          actionType: 'pause',
          kind: 'missing_audit_entry',
          description:
            'The contract is currently paused on-chain, but the audit log has no record of any pause action — likely paused via a direct contract call outside the admin panel.',
        },
      ];
    }
    return [];
  }

  const latest = logEntries[logEntries.length - 1];
  const expectedPaused = latest.actionType === 'pause';

  if (expectedPaused !== onChainPaused) {
    return [
      {
        // Always described in terms of "pause" — the paused=true state is
        // the notable one either way: either it's on-chain with no logged
        // pause behind it, or it's logged but not reflected on-chain.
        actionType: 'pause',
        kind: onChainPaused ? 'missing_audit_entry' : 'missing_onchain_effect',
        description: onChainPaused
          ? "The contract is currently paused on-chain, but the audit log's most recent recorded action was an unpause (or no pause since) — likely paused via a direct contract call outside the admin panel."
          : "The audit log's most recent recorded action was a pause, but the contract is not currently paused on-chain — it may have been unpaused via a direct contract call, or the recorded pause transaction failed.",
      },
    ];
  }

  return [];
}

async function reconcileFeeWithdrawals(
  store: AdminAuditStore,
): Promise<{ mismatches: ReconciliationMismatch[]; skipped?: string }> {
  const logEntries = store.getAllByActionTypeOldestFirst(['fee_withdrawal']);

  let indexedEvents;
  try {
    const page = await fetchEvents({ type: 'fees_withdrawn', limit: 200 });
    indexedEvents = page.events;
  } catch {
    return {
      mismatches: [],
      skipped:
        'fee_withdrawal: indexer unavailable, skipped reconciling against on-chain events',
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const mismatches: ReconciliationMismatch[] = [];

  // Match by tx hash where the log has one; fall back to amount+timestamp
  // proximity (5 minute window) for older entries recorded before tx-hash
  // capture was fixed, or if the wallet adapter didn't return one.
  const matchedEventIds = new Set<number>();
  const matchedLogIds = new Set<number>();

  for (const entry of logEntries) {
    const match = indexedEvents.find((ev) => {
      if (matchedEventIds.has(ev.id)) return false;
      if (entry.txHash && typeof ev.data.tx_hash === 'string') {
        return ev.data.tx_hash === entry.txHash;
      }
      const evAmountStroops =
        typeof ev.data.amount_xlm === 'number'
          ? Math.round(ev.data.amount_xlm * STROOPS_PER_XLM)
          : null;
      const amountMatches =
        evAmountStroops !== null &&
        entry.amountStroops !== null &&
        Math.abs(evAmountStroops - entry.amountStroops) <= 1;
      const withinWindow = Math.abs(ev.timestamp - entry.timestamp) <= 300;
      return amountMatches && withinWindow;
    });

    if (match) {
      matchedEventIds.add(match.id);
      matchedLogIds.add(entry.id);
    }
  }

  for (const entry of logEntries) {
    if (matchedLogIds.has(entry.id)) continue;
    if (now - entry.timestamp < INDEXER_LAG_GRACE_SECONDS) continue;
    mismatches.push({
      actionType: 'fee_withdrawal',
      kind: 'missing_onchain_effect',
      target: entry.txHash ?? undefined,
      description: `A fee withdrawal recorded in the audit log at ${new Date(entry.timestamp * 1000).toISOString()} has no matching fees_withdrawn event in the indexer — the transaction may have failed after being recorded.`,
    });
  }

  for (const ev of indexedEvents) {
    if (matchedEventIds.has(ev.id)) continue;
    mismatches.push({
      actionType: 'fee_withdrawal',
      kind: 'missing_audit_entry',
      description: `An on-chain fees_withdrawn event at ledger ${ev.ledger} has no matching audit log entry — likely a direct contract call outside the admin panel.`,
    });
  }

  return { mismatches };
}

/**
 * GET /api/admin/audit-log/reconcile
 *
 * Compares the audit log against on-chain reality and returns any detected
 * drift. See docs/admin-audit-log.md for the full design — in short:
 *
 * - Validator add/remove and pause/unpause are reconciled against the
 *   contract's *current* state (get_validators / is_paused), read directly
 *   from Soroban RPC — not from anything the frontend itself wrote. A
 *   direct CLI call that changes this state is exactly as visible here as
 *   one made through the admin panel, because the comparison is against
 *   the chain, not against a frontend-controlled cache.
 * - Fee withdrawals are additionally reconciled against the indexer's
 *   `fees_withdrawn` event stream, which the indexer polls straight from
 *   Soroban RPC independent of the frontend — so a CLI-invoked
 *   withdraw_fees still shows up as an indexed event with no matching
 *   audit log entry.
 */
export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const store = AdminAuditStore.getInstance();
  const skipped: string[] = [];
  const mismatches: ReconciliationMismatch[] = [];

  try {
    const [validatorMismatches, pauseMismatches, feeResult] = await Promise.all(
      [
        reconcileValidators(store),
        reconcilePauseState(store),
        reconcileFeeWithdrawals(store),
      ],
    );

    mismatches.push(
      ...validatorMismatches,
      ...pauseMismatches,
      ...feeResult.mismatches,
    );
    if (feeResult.skipped) skipped.push(feeResult.skipped);
  } catch (err) {
    log.error('Reconciliation failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Reconciliation failed' },
      { status: 502 },
    );
  }

  if (mismatches.length > 0) {
    log.warn('Reconciliation found mismatches', { count: mismatches.length });
  }

  const result: ReconciliationResult = {
    checkedAt: Math.floor(Date.now() / 1000),
    mismatches,
    skipped,
  };
  return NextResponse.json(result);
}
