# Admin audit log & reconciliation: design

Design notes for issue #670 — a unified audit trail for all four admin
action types (validator add/remove, fee withdrawal, pause/unpause) plus
reconciliation against on-chain truth. Implemented in `lib/adminAudit.ts`,
`lib/adminAuditStore.ts`, `lib/adminAuth.ts`, `app/api/admin/audit-log/*`,
`lib/adminAuditClient.ts`, `hooks/useAdminAuditLog.ts`,
`components/admin/AdminAuditLog.tsx`, and the `execAction` wiring in
`app/[locale]/admin/page.tsx`.

## Admin API rate-limit audit

Before this guard, the admin API routes relied on authentication but did not
apply request rate limiting. This included expensive reconciliation and fraud
flag evaluation calls, as well as audit-log reads, academy operations, health,
cleanup, referral, and fraud-flag mutation routes.

`middleware.ts` now applies the shared `lib/rateLimit.ts` limiter to every
`/api/admin/*` route, keyed by route and client IP. Reconciliation and fraud
evaluation allow 3 requests per 5 minutes and 1 minute respectively; other
admin routes allow 30 requests per minute. The response is HTTP 429 with a
`Retry-After` header and a clear JSON error. `AdminAuditLog` surfaces that
message instead of replacing it with an undifferentiated fetch error.

The limiter uses shared Upstash Redis when configured and the repository's
documented in-memory fallback otherwise. Authentication remains enforced by
each route after the middleware guard.

| Route family                                                   | Current status                                    |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `/api/admin/audit-log` and `/api/admin/audit-log/reconcile/**` | Covered; reconciliation uses the stricter limit.  |
| `/api/admin/academies/**`                                      | Covered by the general admin limit.               |
| `/api/admin/automated-moderation-log`                          | Covered by the general admin limit.               |
| `/api/admin/config-status`                                     | Covered by the general admin limit.               |
| `/api/admin/fraud-flags/**`                                    | Covered; full evaluation uses the stricter limit. |
| `/api/admin/health`                                            | Covered by the general admin limit.               |
| `/api/admin/ipfs-cleanup`                                      | Covered by the general admin limit.               |
| `/api/admin/orphaned-uploads`                                  | Covered by the general admin limit.               |
| `/api/admin/referrals`                                         | Covered by the general admin limit.               |

## UI pagination audit

The audit store and `GET /api/admin/audit-log` endpoint use keyset pagination:
they return up to the requested limit plus a `nextCursor` containing the last
entry ID when older entries remain. Previously, `useAdminAuditLog` requested
the first 100 entries but discarded `nextCursor`, and `AdminAuditLog` had no
control to request another page. The UI was therefore silently limited to the
newest 100 entries.

The hook now exposes `nextCursor` and `loadMore`. The component appends older
pages using the existing `before` cursor while preserving the active action and
date filters. A platform with more than 100 entries can therefore reach its
full retained history without a page reload.

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
`packages/indexer/src/db/eventStore.ts`'s conventions for the parts that
still apply: conservative column-vs-JSON-blob schema, singleton store,
keyset pagination).

As of issue #1176, schema is no longer a bare `CREATE TABLE IF NOT EXISTS`
run unconditionally on open — `adminAuditStore.ts` was the first store
migrated onto `lib/sqliteMigrations.ts`'s shared, versioned migration
runner (see `lib/migrations/adminAuditMigrations.ts`), applied via
`lib/sqliteDb.ts`'s `openSqliteDb`. Applied versions are tracked in a
`schema_version` table in the same database file, so a future schema change
(a new column, a new index) is added as a new migration rather than a
one-off manual script or a destructive drop-and-recreate. Migration 1 for
every store reproduces that store's already-shipped schema with
`IF NOT EXISTS` DDL, so opening an existing production database applies
zero destructive changes — it only records that version 1 is present.
`watchlistStore.ts` and `savedSearchStore.ts` (the other two
`openSqliteDb`-backed stores) have been migrated onto the same runner;
`packages/indexer/src/db/eventStore.ts` is a separate package with its own
bootstrap and has not been (it doesn't use `lib/sqliteDb.ts`).

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

As of issue #1188, `.github/workflows/reconcile-audit-log.yml` does exactly
this: a scheduled GitHub Actions workflow (every 15 minutes, plus
`workflow_dispatch` for a manual run) calls the endpoint directly. Because
the endpoint is gated by the same session-cookie admin check every other
`app/api/admin/**` route uses (`requireAdminWallet`, `lib/adminAuth.ts`),
and this issue deliberately makes no changes to that auth mechanism, the
workflow authenticates by replaying a real admin session cookie:

1. Sign in to the deployed app as the admin wallet with "remember me"
   checked, so the `session_refresh` cookie (and the `session` access
   cookie it can mint fresh access tokens from) lives for
   `REMEMBER_ME_REFRESH_TTL_SEC` (30 days) rather than the default 1 day.
2. Copy the `session` cookie's value and store it as the `ADMIN_SESSION_COOKIE`
   repository secret. Set the `DEPLOYED_APP_URL` repository variable to the
   deployment's base URL.
3. The access token itself is short-lived (`ACCESS_TOKEN_TTL_SEC`, 20
   minutes) — this cookie will need to be refreshed/replaced periodically
   (well within the 30-day session lifetime) by repeating step 1, since this
   workflow calls the reconciliation endpoint directly rather than going
   through `/api/auth/refresh`.

If a Vercel Cron job is preferred instead, the same constraint applies: it
needs some way to attach a valid `session` cookie to its request. A future,
separately-scoped issue could add a dedicated service-token auth path for
schedulers (bypassing the session-cookie requirement entirely) — out of
scope here, since this issue's goal was wiring the periodic trigger onto
the endpoint exactly as it already exists, per the framing above.

## Reconciliation-run history

Every call to `GET /api/admin/audit-log/reconcile` — whether from an
admin's open panel or the scheduled workflow above — persists its result via
`ReconciliationHistoryStore` (`lib/reconciliationHistoryStore.ts`, issue
#1188), mirroring the other `lib/*Store.ts` conventions: its own
better-sqlite3-backed file, schema applied through
`lib/sqliteMigrations.ts`'s versioned runner (see
`lib/migrations/reconciliationHistoryMigrations.ts`), process-wide
singleton. Each row records `checked_at`, the full mismatch list (including
type and target — enough to reconstruct exactly what drift existed at that
point in time), and how many of those mismatches were newly-appearing
relative to the immediately preceding run.

`AdminAuditLog.tsx` gains a collapsible "Reconciliation history" section
(collapsed by default, to keep the page from growing unbounded) listing
past runs — timestamp, mismatch count, new-mismatch count, and the distinct
mismatch `kind`s seen — below the existing live-result banner, which still
shows only the single latest run.

## Alerting on newly-appearing mismatches

A run whose mismatch set contains at least one entry not present in the
immediately preceding run triggers a notification via
`lib/reconciliationNotify.ts`'s `notifyNewMismatches`. Two mismatches are
considered "the same" (not new) when their `actionType`, `kind`, and
`target` all match — `lib/reconciliationHistoryStore.ts`'s `mismatchKey`.
This is what keeps a mismatch that persists across many consecutive runs
(e.g. an admin hasn't gotten around to fixing it yet) from re-triggering a
fresh notification every single run — it only fires once, on first
appearance. This issue does not implement the acceptance criteria's
_optional_ longer-cadence "still unresolved" reminder; the history view
above already lets an admin see how long a mismatch has persisted.

**Notification channel: webhook, not email.** This repo has no
email-sending dependency or configured provider anywhere in it — adding one
solely for this one alert would mean picking and wiring an entire provider
integration (SES, SendGrid, Resend, or similar) for a single call site. A
webhook needs nothing new: set the `RECONCILIATION_WEBHOOK_URL` environment
variable to any HTTPS endpoint (a Slack incoming webhook, a PagerDuty
Events API URL, a custom endpoint) and a JSON payload (`{ text, checkedAt,
newMismatches, totalMismatches }` — `text` is a ready-to-display Slack-style
summary line) is POSTed to it whenever a run finds a new mismatch. Unset,
this is a no-op — same "fails open, no infra required" default as the rest
of this design. Delivery is fire-and-forget (errors are swallowed), for the
same reason `recordAuditEntry` is: a notification failure must never affect
the reconciliation response itself.

## Surfacing mismatches

`components/admin/AdminAuditLog.tsx` renders a non-dismissible
`role="alert" aria-live="assertive"` banner whenever the last reconciliation
run found any mismatches (mirroring `components/ContractIncompatibleBanner.tsx`'s
precedent for "this isn't something an admin should be able to shrug off by
dismissing it") — not just a log line. Individual mismatches are listed by
description directly in the banner rather than requiring the admin to
cross-reference the audit table.

## Dispute decisions capture the deciding admin separately (issue #1168)

This document's audit log/reconciliation system covers the four on-chain
admin actions (validator add/remove, fee withdrawal, pause/unpause) — it
does not cover milestone dispute decisions, which are a separate off-chain
moderation record (`lib/milestoneDisputeStore.ts`, issue #562).

Audited as part of #1168: a dispute decision **already** records which
admin made the call, not just the outcome and timestamp. `PATCH
/api/disputes/:id/decide` (`app/api/disputes/[id]/decide/route.ts`) resolves
the caller's identity via `requireAdminWallet(req)` — the same
session-cookie-verified wallet lookup used throughout `app/api/admin/**` —
and passes it as `decidedBy` to `MilestoneDisputeStore.decide()`, which
persists it in the `decided_by` column alongside `decided_at` and `status`.
It's exposed on `MilestoneDispute.decidedBy` (`types/index.ts`) as
`string | null` (`null` only for still-`pending` disputes), and
`__tests__/api/disputes/[id]/decide/route.test.ts` and
`__tests__/lib/milestoneDisputeStore.test.ts` both assert on it.

This already satisfies the single-super-admin model's forward-looking
need: once any scoped-admin-role work lands (making `decidedBy` meaningful
across more than one possible wallet), no retrofit is required — the field
has been captured since the dispute flow first shipped.

## What this doesn't do

- No automatic remediation — a detected mismatch is surfaced for a human to
  investigate, never auto-corrected.
- No historical replay for validator/pause state before the audit log
  existed — reconciliation only knows what the log has recorded since this
  feature shipped; a validator added before that point looks identical to
  one added via a since-untracked CLI call (both are `missing_audit_entry`).
  This is an inherent limit of building the log going forward rather than
  backfilling it from history that was never captured.
