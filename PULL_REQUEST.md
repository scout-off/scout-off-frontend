# fix: normalize Stellar addresses in watchlist (#1150) and ensure live queue counts in banner (#1151)

Closes #1150, #1151

## Summary

This PR addresses two critical UX issues:

1. **Address normalization for watchlist entries** - Stellar public keys with different casing could create duplicate watchlist entries or cause "already in watchlist" checks to fail when they should have matched
2. **Live queue counts in banner** - The OfflineQueueBanner component could show stale pending counts when items completed while mounted but before the next refresh trigger

## Changes

### lib/stellar.ts
- Added `normalizeStellarAddress(key: string): string` function that validates and uppercases Stellar addresses using `StrKey.encodeEd25519PublicKey()`
- Already had `isValidStellarAddress(key: string): boolean` for pre-validation

### lib/watchlistStore.ts
- Imported `normalizeStellarAddress` from `@/lib/stellar`
- Modified `add(scoutWallet, playerId)` to normalize **both** addresses before storage
- Modified `remove(scoutWallet, id)` to normalize `scoutWallet` before lookup
- Modified `clearForWallet(scoutWallet)` to normalize `scoutWallet` before deletion
- Modified `list(scoutWallet)` to normalize `scoutWallet` before querying

### app/api/watchlist/route.ts
- Imported `normalizeStellarAddress` and `isValidStellarAddress` from `@/lib/stellar`
- Added validation in `POST` handler to reject non-Stellar addresses with 400
- Added normalization of `playerId` before passing to `WatchlistStore.getInstance().add()`

### hooks/useOfflineQueue.ts
- Added a new `useEffect` hook that polls for queue updates every 2 seconds
- Only polls when `status === 'processing'`, `pendingCount > 0`, or `failedCount > 0`
- Calls `refreshCounts()` during each poll cycle to sync with IndexedDB state
- Runs an immediate poll on mount, then at the 2s interval
- Clears the interval on unmount

### Tests

#### __tests__/lib/watchlistStore.test.ts
- Added test suite `WatchlistStore address normalization` with:
  - Verify player addresses are normalized to uppercase before storage
  - Verify scout wallet addresses are normalized to uppercase before storage
  - Verify same address with different casing is treated as a duplicate

#### __tests__/api/watchlist/route.test.ts
- Added test suite `POST /api/watchlist address validation and normalization` with:
  - Verify invalid playerIds are rejected with 400
  - Verify short addresses are rejected with 400
  - Verify lowercase playerIds are normalized to uppercase
  - Verify mixed-case playerIds are normalized to uppercase
  - Verify same address added twice with different casing results in one entry

#### __tests__/components/player/OfflineQueueBanner.test.tsx
- Added test suite `OfflineQueueBanner live count updates` with:
  - Verify displayed count updates when an item completes
  - Verify banner hides when count reaches 0
  - Verify processing state shows and retry button hides during `isProcessing`

## Acceptance Criteria

### For #1150 (Stellar address normalization)
- [x] Audit confirms whether normalization happens today — NO, added normalization
- [x] If missing, addresses are normalized at the point of write to watchlistStore — DONE
- [x] Test adds same address in two different casings and asserts single watchlist entry — DONE

### For #1151 (Live queue counts)
- [x] Audit confirms whether banner count is live-derived or can drift — CAN DRIFT, added polling fix
- [x] Banner updated to subscribe to same state useOfflineQueue exposes — DONE via polling
- [x] Test simulates item completing while banner is mounted and asserts count decrements — DONE

## Testing

```bash
npm test -- __tests__/lib/watchlistStore.test.ts --no-coverage
npm test -- __tests__/api/watchlist/route.test.ts --no-coverage
npm test -- __tests__/components/player/OfflineQueueBanner.test.tsx --no-coverage
```

## Security Impact

**High for #1150** — This fixes a class of bug where:
- Same Stellar address with different casing (e.g., `G...` vs `g...`) could create duplicate watchlist entries
- "Already in watchlist" checks could fail when they should have matched
- Most real-world Stellar SDK usage already returns consistently-cased keys — the risk shows up specifically with manually-typed or copy-pasted address input paths

**None for #1151** — This is a UX improvement with no security implications.

## Background

### Stellar Address Normalization (Issue #1150)
Stellar public keys can be represented with different casing in some contexts. The watchlist implementation was not normalizing addresses before using them as lookup/dedup keys, which could allow the same player to be added to a watchlist twice under differently-cased references.

The fix ensures that all addresses are stored and compared in uppercase, preventing these edge cases entirely.

### OfflineQueueBanner Live Counts (Issue #1151)
Players on low-bandwidth connections rely on this banner to know whether their registration/update actually went through. A banner that lags behind reality (e.g., showing "2 pending" after one has already succeeded) erodes user confidence that the feature is working as intended.

The polling approach was chosen over:
- **Immediate revalidation after every IndexedDB operation**: Too invasive, would require modifying offlineQueue.ts
- **IndexedDB `versionchange` events**: Complex to coordinate across tabs
- **Manual refresh only**: Too brittle, relies on user action

2 second polling provides a good balance: fresh enough for UX while not overloading IndexedDB or causing UI thrash.
