<!-- Branch: test/jest-provider-helper -->
<!-- Title: test(infra): add __tests__/setup-providers.tsx helper for app-level renders -->

## Summary

Foundation PR for resolving the "must be used inside `<X>` provider" failure
mode in tests that render App Router components. Several existing tests
(`ScoutDashboard.test.tsx` is the prototype) crash because they render
`<Dashboard />` — which transitively consumes `SWRConfig`, `ToastProvider`,
and `WalletProvider` — without wrapping those providers. Without a shared
helper, every new App-Router test would re-implement the same boilerplate
wrapper, leading to drift. This branch adds the helper and the two jest config
tweaks that prevent it from being mistaken for a test suite.

## What's changed (3 files, +98/-0)

- **`__tests__/setup-providers.tsx`** (new, +76) — exports a
  `renderWithProviders(ui, options)` helper that wraps the supplied
  element in `SWRConfig` (cache: `undefined`, dedupingInterval: 0 for test
  determinism), `ToastProvider`, and `WalletProvider`. Re-exports
  `render`, `screen`, `fireEvent`, `waitFor`, `act`, `cleanup` from
  `@testing-library/react` so existing tests can swap one import line to
  migrate. Provider order matters and is documented inline.

- **`jest.config.js`** (+8) — adds
  `'<rootDir>/__tests__/setup-providers[^/]*\.tsx'` to `testPathIgnorePatterns`.
  Without this, Jest treats the helper as a test suite containing zero tests
  and reports a warning under `--ci` (rather than silently passing).

- **`jest.setup.ts`** (+14) — adds a global `beforeEach` that clears
  `localStorage` and `sessionStorage`. Required because `WalletProvider`
  reads persisted wallet state from storage and `jsdom` shares storage
  across `test()` blocks in the same file, causing inter-test bleed that
  presents as "wallet connected in test that never connected it".

## Pattern

Existing pattern: see `__tests__/app/layout.test.tsx` line ~237 for the
`process.env.NODE_ENV` override/restore dance and `jest.setup.ts` precedent
for global hooks.

## Validation

| Check                                         | Result   |
| --------------------------------------------- | -------- |
| `npx tsc --noEmit -p tsconfig.typecheck.json` | ✅ clean |
| `npx eslint __tests__/setup-providers.tsx`    | ✅ clean |
| `npx prettier --check` (3 files)              | ✅ clean |
| `npx jest ... --ci` (no zero-test warnings)   | ✅ clean |

## Out-of-scope (NOT introduced by the migration)

This branch only adds the helper plus the two jest-config touch-ups in
`jest.config.js` and `jest.setup.ts`. Migrating
existing failing tests (`ScoutDashboard.test.tsx` and friends) to use
`renderWithProviders` is a follow-up — those tests still crash on `main`.

Pre-existing parser-level failures surfaced by parsing `lib/api.ts` cleanly
(e.g. orphan declaration) are independently resolved by the companion
branch `test/fix-lib-api-parser`.
