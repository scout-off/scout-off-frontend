# Admin audit log & reconciliation: design

Design notes for issue #670 — a unified audit trail for all four admin
action types (validator add/remove, fee withdrawal, pause/unpause) plus
reconciliation against on-chain truth. Implemented in `lib/adminAudit.ts`,
`lib/adminAuditStore.ts`, `lib/adminAuth.ts`, `app/api/admin/audit-log/*`,
`lib/adminAuditClient.ts`, `hooks/useAdminAuditLog.ts`,
`components/admin/AdminAuditLog.tsx`, and the `execAction` wiring in
`app/[locale]/admin/page.tsx`.

Scoped to exclude validator-specific audit/CSV work already covered by a
separate validator-audit-log feature request — this system is the
cross-action superset (validator actions included, but not limited to
them), not a duplicate of that narrower one.

## Two independent halves

**1. The audit log (frontend-originated).** `app/[locale]/admin/page.tsx`'s
`execAction` already builds and signs a transaction for each of the four
action types via `useWallet().signAndSubmit(xdr)`. Immediately after that
resolves with a transaction hash, it calls
`recordAuditEntry({ actionType, target?, amountStroops?, txHash, status: 'submitted' })`,
which `POST`s to `/api/admin/audit-log` and is persisted in
`lib/adminAuditStore.ts` (a `better-sqlite3` table, mirroring
`packages/indexer/src/db/eventStore.ts`'s conventions — see that file's own
doc comment for why: no separate migration tool, conservative
column-vs-JSON-blob schema, singleton store, keyset pagination).

This call is fire-and-forget (`.catch(() => {})`) — a failure to _log_ an
action must never block, delay, or roll back the action itself, which has
already gone on-chain (or at least been submitted) by the time the log
write happens.

**2. On-chain truth (origin-agnostic).** Reconciliation
(`GET /api/admin/audit-log/reconcile`) never trusts the audit log as its
own source of truth — it always re-derives "what actually happened" from
somewhere the frontend doesn't control:

- **Validator add/remove** and **pause/unpause**: read the contract's
  _current_ state directly via `lib/contract.ts`'s `getValidators()` and
  `getContractPaused()` (`simulateTx` calls straight to Soroban RPC — no
  caching, no dependency on anything the admin panel wrote). The audit log
  is replayed in timestamp order to compute what the _expected_ current
  state should be (an accumulated validator set; the most recent
  pause/unpause action), and that expectation is diffed against the real
  on-chain state.
- **Fee withdrawals**: additionally cross-checked against the indexer's
  `fees_withdrawn` event stream (`lib/indexerClient.ts`'s `fetchEvents`).
  `packages/indexer` polls Soroban RPC for contract events on its own
  schedule (see `packages/indexer/src/eventPoller.ts`), independent of any
  particular frontend session — so a `fees_withdrawn` event is present
  there regardless of what triggered it.

## How a direct-CLI call is still caught

This is the crux of the acceptance criterion: if an admin runs
`soroban contract invoke ... add_validator ...` (or `remove_validator`,
`pause_contract`, `unpause_contract`, `withdraw_fees`) directly against the
deployed contract, bypassing the admin panel entirely, **no audit log entry
is ever written** for that call — `POST /api/admin/audit-log` is only ever
called from `execAction`. But reconciliation doesn't need an audit log
entry to notice the drift, because its comparison target is never the
audit log alone:

- A CLI `add_validator` shows up in `getValidators()` immediately. The next
  reconciliation run computes "expected set per audit log" (which doesn't
  include this address) vs. "actual on-chain set" (which does), and emits a
  `missing_audit_entry` mismatch for that address.
- A CLI `pause_contract` flips `getContractPaused()` to `true`. Reconciliation
  compares that against the audit log's most recent pause/unpause entry (which
  may say "unpaused," or may not exist at all) and flags the same kind of
  mismatch.
- A CLI `withdraw_fees` emits the same `fees_withdrawn` contract event a
  panel-triggered withdrawal would — the indexer captures it regardless of
  origin, so it shows up as an indexed event with no matching audit log
  entry (matched by tx hash, falling back to amount+timestamp proximity for
  older entries).

In every case, the mismatch is symmetric: an audit log entry with no
matching on-chain effect (`missing_onchain_effect` — e.g. a submitted
transaction that later failed, or was reverted by a _subsequent_ CLI call)
is reported exactly the same way, just with the two sides swapped. Neither
side is treated as more authoritative than the other for detecting drift —
only the on-chain reads (`getValidators`, `getContractPaused`, indexed
events) are treated as ground truth for what the _audit log_ is checked
against.

## Why not extend the indexer's event types instead

The indexer's event decoder (`packages/indexer/src/eventPoller.ts`) only
recognizes 7 event types today, and none of `validator_added`,
`validator_removed`, `contract_paused`, `contract_unpaused` are among them.
Adding decoder support for them would require knowing the exact
topic/schema the Soroban contract emits for those calls — but this repo
doesn't include the contract's Rust source, so that shape can't be
confirmed here. Reading current state directly via existing, known-real
`simulateTx` calls (`getValidators`, `getContractPaused`) avoids depending
on an assumption about event wire formats that can't be verified in this
codebase. `fees_withdrawn` is the one exception because it's already a
real, indexed event type today.

## Periodic vs. on-demand reconciliation

`hooks/useAdminAuditLog.ts` runs reconciliation once on mount and again
every 5 minutes (`RECONCILE_INTERVAL_MS`) for as long as an admin has the
audit log open, plus an explicit "Run Reconciliation" button for on-demand
checks. This deployment has no cron/scheduler infrastructure of its own, so
there's no reconciliation running while no admin is looking — if that's
needed, `GET /api/admin/audit-log/reconcile` is a plain authenticated HTTP
endpoint and can be triggered by any external scheduler (a Vercel Cron job,
a GitHub Actions scheduled workflow, or an uptime-ping-style service)
exactly as-is, without further changes to this design.

## Surfacing mismatches

`components/admin/AdminAuditLog.tsx` renders a non-dismissible
`role="alert" aria-live="assertive"` banner whenever the last reconciliation
run found any mismatches (mirroring `components/ContractIncompatibleBanner.tsx`'s
precedent for "this isn't something an admin should be able to shrug off by
dismissing it") — not just a log line. Individual mismatches are listed by
description directly in the banner rather than requiring the admin to
cross-reference the audit table.

## What this doesn't do

- No automatic remediation — a detected mismatch is surfaced for a human to
  investigate, never auto-corrected.
- No historical replay for validator/pause state before the audit log
  existed — reconciliation only knows what the log has recorded since this
  feature shipped; a validator added before that point looks identical to
  one added via a since-untracked CLI call (both are `missing_audit_entry`).
  This is an inherent limit of building the log going forward rather than
  backfilling it from history that was never captured.
