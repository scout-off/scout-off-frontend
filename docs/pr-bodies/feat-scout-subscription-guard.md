<!-- Branch: feat/scout-subscription-guard -->
<!-- Title: feat(scout): add subscription guard to dashboard (ISSUES.md Issue #7) -->

## Summary

Closes **ISSUES.md #7**. Scouts without an active subscription are redirected away from the dashboard to `/scout/subscribe?reason=subscription-expired` via the existing `useRequireSubscription` hook, instead of landing on an empty/broken page.

## What changed (2 files)

- **`app/[locale]/scout/page.tsx`** — calls `useRequireSubscription()`, returns `null` whenever `loading || !isProtected`. The hook's `useEffect` schedules `router.replace` to `/scout/subscribe?reason=subscription-expired`, so no further wiring is needed here.
- **`__tests__/app/[locale]/scout/page.test.tsx`** (new) — 4 tests: protected (renders), loading (returns null), not-protected (returns null), state transition (loading → null → protected rerender renders content).

## Why the `hydrated` flag

The server emits a pass-through (no React state read) of `<ErrorBoundary><Suspense><ScoutDashboardContent /></Suspense></ErrorBoundary>` because no React state is read on the server. The first client render mirrors that via a `hydrated` flag that flips to `true` in a `useEffect(() => setHydrated(true), [])`, so React's hydration reconciles cleanly. The guard runs on every render after hydration.

## Coexistence with `useRequireWallet`

For an unauthenticated expired user:

- `useRequireWallet` fires first (no `publicKey`) → redirect to `/?reason=wallet-required`.
- `useRequireSubscription` early-returns when `publicKey` is absent.

No redirect loop is possible.

## Validation

| Check                                                                               | Result                         |
| ----------------------------------------------------------------------------------- | ------------------------------ |
| `npx tsc --noEmit -p tsconfig.typecheck.json`                                       | ✅ clean                       |
| `npx eslint app/[locale]/scout/page.tsx __tests__/app/[locale]/scout/page.test.tsx` | ✅ clean                       |
| `npx prettier --check` (same files)                                                 | ✅ clean                       |
| `npx jest --testPathPattern 'app/\[locale\]/scout/page'`                            | ✅ 4/4 pass                    |
| `npx jest __tests__/hooks/useRequireSubscription.test.ts`                           | ✅ 6/6 pass (regression-clean) |

## Run the new test

```bash
npx jest --testPathPattern 'app/\[locale\]/scout/page'
```

## Out-of-scope (pre-existing, NOT introduced by this branch)

`__tests__/components/ScoutDashboard.test.tsx` has 11 pre-existing failures (missing `ToastProvider` wrapper in the test infrastructure), confirmed identical on the parent commit `chore/resolve-30-issues`. Addressed separately by `test/jest-provider-helper` branch on the user's fork.
