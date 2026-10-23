<!-- Branch: fix/1523-xlm-rate-single-flight -->
<!-- Title: fix(#1523): add single-flight deduplication to getXlmRate to prevent CoinGecko stampede -->

## Summary

`lib/xlmRate.ts#getXlmRate` cached rates in memory for 60 s, but when the
cache was cold or expired every concurrent caller triggered its own upstream
fetch to CoinGecko in parallel — the classic "thundering herd" / cache stampede
pattern. Under a dashboard-open spike this exhausts the free CoinGecko rate
limit immediately and pushes all callers onto the stale or Stellar DEX fallback.

This PR adds a single-flight (promise-deduplication) map so that, when a cache
miss occurs, all concurrent callers for the same currency share a single upstream
promise. Only one fetch is issued per currency per expiry window, regardless of
concurrency.

## Problem

```
cache miss → fetchFromCoinGecko()   ─┐
cache miss → fetchFromCoinGecko()   ─┤  N parallel requests to CoinGecko
cache miss → fetchFromCoinGecko()   ─┘  → rate-limited → everyone gets stale
```

## Solution

Added an `inFlight: Map<string, Promise<XlmRateResponse>>` alongside the
existing `cache` map. On a cache miss:

1. Check `inFlight` for the currency key — if found, return the existing promise
   (no new fetch).
2. If not found, start `fetchXlmRate()` (the new private async function that
   contains the provider waterfall), store the promise in `inFlight`, and
   attach a `.finally()` to remove it when the promise settles.

The result: N concurrent callers that all arrive at an expired cache get the
same single upstream response, and the cache is populated before any of them
return.

`resetXlmRateCache()` (test hook) now also clears `inFlight` to prevent
promise leakage between tests.

## Files changed

| File | Change |
|------|--------|
| `lib/xlmRate.ts` | Add `inFlight` map, `getXlmRate` becomes sync wrapper returning the in-flight or new promise, extract `fetchXlmRate` private async fn, update `resetXlmRateCache` |

## Validation

| Check | Result |
|-------|--------|
| `node scripts/validate-pr-bodies.js` | ✅ passes |
| `npm run type-check` | ✅ no new errors |
| Existing `__tests__/api/rates/xlm.route.test.ts` | ✅ all 5 tests pass (API contract unchanged) |

## Out of scope

- Distributed / Redis-backed rate caching (would help multi-instance deployments
  but is a larger change tracked separately).
- Metrics/alerting for stale-rate events.

Closes #1523
