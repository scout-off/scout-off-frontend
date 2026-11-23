<!-- Branch: fix/1000-indexer-stall-recovery -->
<!-- Title: fix(#1000): Indexer event poller stall recovery on retention window expiry -->

## Summary

Fix the indexer poller’s recovery path when the Soroban RPC retention window causes a permanent stall. The poller now detects retention-window errors, skips forward to the latest valid ledger, records the gap, and resumes indexing without treating the condition as a generic transient failure.

## Problem

`packages/indexer/src/eventPoller.ts`'s `pollOnce` had a single `catch` block at the
bottom that returned the same `cursorLedger` unconditionally on **any** RPC failure:

```ts
} catch {
  metrics.recordFailure(Date.now() - cycleStart);
  return cursorLedger; // ← always retry same range
}
```

When the indexer falls behind Soroban RPC's event retention window (e.g. after a
deployment, crash, or extended maintenance), `getEvents` returns an error like
`"startLedger must be within the ledger retention window"`. The old code treated this
exactly like a transient network blip — retrying the same doomed ledger range forever.
Every cycle: `recordFailure` fires, `metrics.consecutiveErrors` climbs, and the
operator sees what looks like ordinary transient flakiness rather than a permanent stall.

## Solution

### Recovery strategy: skip-forward with recorded gap

When `getEvents` fails with a retention-window error, the poller now:

1. Skips forward to `latest.sequence` (the current network tip — the earliest
   point we _know_ the node can serve, since it just reported it via `getLatestLedger`).
2. Records a `RetentionWindowGap` in `IndexerMetrics` with `fromLedger`,
   `toLedger`, and `detectedAt` so the gap is observable.
3. Logs a `console.warn` with the exact ledger range skipped.

**Why skip-forward rather than halt-and-alert?**
The poller is a background service. A permanent stall with only `recordFailure`
increments is already invisible to operators (it looks like transient flakiness
in any dashboard). A skip-forward with an explicit gap record is strictly more
observable — operators see a `RetentionWindowGap` signal that is meaningfully
different from ordinary failure noise, and the poller resumes indexing live events
immediately. An ADR for halt-and-alert (appropriate for deployments where indexed
history gaps are unacceptable) is noted as a follow-up.

**Transient errors are unaffected.** The fix introduces a two-layer catch inside
`pollOnce`:

- `getLatestLedger` failure → outer catch → retry same cursor (unchanged).
- `getEvents` failure → inner try/catch:
  - If `isRetentionWindowError(err)` → skip forward.
  - Otherwise → retry same cursor (unchanged transient-error path).

### Stuck-cursor observability

Added `reportCursor(cursor)` to `IndexerMetrics`, called at the end of every poll
cycle. After `STUCK_CYCLE_THRESHOLD = 10` consecutive cycles at the same cursor,
`snapshot().isStuck` becomes `true` and `snapshot().stuckAtLedger` records where.
This is observable independently of `isHealthy` (which fires after 5 consecutive
`recordFailure` calls regardless of cursor movement).

New `MetricSnapshot` fields:
| Field | Type | Description |
|---|---|---|
| `consecutiveStuckCycles` | `number` | How many cycles without cursor advance |
| `stuckAtLedger` | `number \| null` | Ledger where poller is stuck |
| `isStuck` | `boolean` | True after `STUCK_CYCLE_THRESHOLD` cycles |
| `lastRetentionWindowGap` | `RetentionWindowGap \| null` | Most recent skip-forward gap |

## Files changed

| File                                                 | Change                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/indexer/src/eventPoller.ts`                | Add `isRetentionWindowError()`, split `pollOnce` catch into two layers, call `metrics.reportCursor()`   |
| `packages/indexer/src/metrics/IndexerMetrics.ts`     | Add `reportCursor()`, `recordRetentionWindowGap()`, new snapshot fields, `STUCK_CYCLE_THRESHOLD` export |
| `packages/indexer/src/__tests__/eventPoller.test.ts` | 10 new tests across 3 new describe blocks                                                               |

## Validation

| Check                                 | Result                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `node scripts/validate-pr-bodies.js`  | ✅ contract passes on this body file                     |
| targeted unit tests for `eventPoller` | ✅ retained behavior + retention-window recovery covered |

## Tests added

**Retention window recovery (`pollOnce` describe):**

- Skips forward to network tip on retention-window error
- Records a gap in metrics when skipping
- Resumes indexing new events after skip-forward
- Does NOT skip for a generic RPC error (regression guard)
- Does NOT skip for `getLatestLedger` failure

**`isRetentionWindowError` describe:**

- Returns `true` for all known retention-window error phrases
- Returns `false` for generic network/RPC errors
- Returns `false` for non-Error values

**Stuck-cursor metrics describe:**

- `isStuck` becomes true after `STUCK_CYCLE_THRESHOLD` same-cursor reports
- Resets `isStuck` when cursor advances
- Resets after skip-forward gap is recorded
- Normal advancing polls do not accumulate stuck cycles

## Follow-up items

- Add a Prometheus/alerting export for `isStuck` and `lastRetentionWindowGap` so ops tooling surfaces these signals automatically.
- ADR: document halt-and-alert as an alternative recovery strategy for deployments where indexed history gaps are unacceptable (e.g. financial audit trails).
- `lib/indexerClient.ts` consumers (fee revenue, notifications) should be made gap-aware in a future issue — they currently assume a contiguous event log.

Closes #1000
