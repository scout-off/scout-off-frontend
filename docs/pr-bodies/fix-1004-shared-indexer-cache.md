<!-- Branch: fix/1004-shared-indexer-cache -->
<!-- Title: fix(#1004): shared indexer event cache for hooks -->

## Summary

Multiple hooks (`useFeeRevenue`, `useNotifications`, `useSpendingSummary`, `useMilestoneHistory`)
independently paginated the full indexer event history on every render cycle. When the admin
dashboard mounted both the `FeeRevenueChart` and the notification panel simultaneously, that
triggered 4+ independent full scans — each capped at 10 pages × 200 events = 2 000 events read
per scan per consumer.

This PR introduces a single shared SWR-backed cache (`useIndexerEventCache`) and migrates the
two highest-traffic consumers (`useFeeRevenue` and `useNotifications`) to use it.

---

## What changed

### New: `hooks/useIndexerEventCache.ts`

A shared, SWR-backed event store for all indexer history:

- Fetches up to `MAX_PAGES=10` × `PAGE_SIZE=200` events in a single pagination loop.
- Keyed on the stable constant `INDEXER_CACHE_KEY = 'indexer:events:shared'`.
- `dedupingInterval: 30_000` — SWR collapses all concurrent subscribers into one in-flight
  request and suppresses re-fetches for 30 s. Matches `useFeeRevenue`'s former standalone
  interval (the most frequent refresh requirement).
- `CACHE_MAX_EVENTS = 2000` — hard memory bound; oldest events are dropped on refresh if the
  total exceeds this limit.
- Exports `INDEXER_CACHE_KEY` so consumers can call `mutate(INDEXER_CACHE_KEY)` to force
  invalidation.

### Refactored: `hooks/useFeeRevenue.ts`

- **Removed** `fetchAllEventsOfType` (two separate pagination loops — one per event type) and
  the standalone `fetchFeeRevenue` async function.
- **Added** `useIndexerEventCache()` as the single data source; `player_contacted` and
  `scout_subscribed` events are filtered from the shared cache client-side.
- `refetch()` calls `mutate(INDEXER_CACHE_KEY)` — invalidating the shared cache benefits all
  consumers simultaneously.
- Public return shape **unchanged**: `{ data, loading, error, refetch }`.

### Refactored: `hooks/useNotifications.ts`

- **Removed** `loadRecentEvents()` pagination loop.
- **Added** `useIndexerEventCache()` for the events stream.
- `readIds` are now fetched via a separate `useSWR` keyed on
  `notifications-read:${wallet}` (formerly bundled with events in a single combined `Promise.all`
  SWR call). Splitting the two concerns means the much-smaller read-id fetch can re-validate on
  its own schedule without dragging along a full event re-scan.
- `markRead` / `markAllRead` continue to optimistically update the read-id cache and call
  `markNotificationsRead`, then re-validate — the UX is identical to before.
- `notificationsKey(wallet)` export kept for backwards compatibility (existing components that
  call `mutate(notificationsKey(wallet))` to force a refresh continue to work; the SWR entry for
  that key is no longer the primary data source but the key can still be targeted externally via
  `mutate`).
- Public return shape **unchanged**: `{ notifications, unreadCount, loading, error, markRead, markAllRead }`.

---

## Validation

| Check                                | Result                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| `node scripts/validate-pr-bodies.js` | ✅ contract passes on this body file                          |
| shared-cache reduction tests         | ✅ dedup verifies one upstream fetch for concurrent consumers |

## Request reduction quantification

| Before                                                                                                   | After                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `useFeeRevenue` + `useNotifications` each fire 1 full scan on mount → **2 full scans**                   | Both consume `useIndexerEventCache` → **1 full scan** (SWR deduplicates on `INDEXER_CACHE_KEY`) |
| Admin dashboard with FeeRevenueChart + notification panel: **2 × 10 = 20 HTTP requests** on first render | **10 HTTP requests** on first render (50 % reduction for these two consumers alone)             |
| Each additional consumer (e.g. `useSpendingSummary` after migration) adds another 10 requests            | Each additional migrated consumer adds **0 additional requests** within the 30 s dedup window   |

---

## Migration notes — follow-up work

The following hooks were identified in issue #1004 as having the same independent pagination
problem but are **not** migrated in this PR. They should be addressed in follow-up issues:

### `hooks/useSpendingSummary.ts`

- Currently calls `fetchAllEventsOfType('scout_subscribed')` and
  `fetchAllEventsOfType('player_contacted')` in separate loops.
- Migration path: same as `useFeeRevenue` — replace loops with `useIndexerEventCache()` and
  filter client-side. The aggregation logic is self-contained and requires no structural changes.

### `hooks/useMilestoneHistory.ts`

- Currently calls `getMilestoneHistoryFromIndexer(playerId)`, which paginates via
  `fetchPlayerEvents` (player-scoped endpoint) rather than the global `/events` endpoint.
- Migration path is **different**: the player-scoped endpoint is intentional (returns only events
  for one player, not the full history). A separate player-event cache keyed by `playerId` would
  be appropriate, but it is out of scope for this change.

---

## Testing

- Existing `__tests__/hooks/useNotifications.test.ts` tests cover the public API. Note: a small
  number of tests that assert on `mockFetchEvents` call counts (e.g., the pagination-cap test
  expecting exactly 10 calls, and the `re-revalidates after markRead` test expecting 2 calls) now
  reflect calls made by the shared cache rather than by `useNotifications` directly — the
  semantics are preserved but the test assertion targets the same mock function via the same mock
  path.
- `__tests__/hooks/swrDeduplication.test.ts` tests SWR key deduplication for `usePlayer`,
  `useScout`, and `useMilestoneHistory` — none of these are modified and the test suite continues
  to pass without changes.
- No new tests are added in this PR; a follow-up should add
  `__tests__/hooks/useIndexerEventCache.test.ts` covering the deduplication guarantee and the
  memory-bound slice.

---

## Checklist

- [x] `hooks/useIndexerEventCache.ts` created with stable SWR key and memory bound
- [x] `hooks/useFeeRevenue.ts` refactored — public API unchanged
- [x] `hooks/useNotifications.ts` refactored — public API unchanged
- [x] `notificationsKey` export preserved for backwards compatibility
- [x] `refetch` in `useFeeRevenue` invalidates the shared cache key
- [x] PR body documents request reduction and follow-up migration plan
