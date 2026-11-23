<!-- Branch: chore/resolve-30-issues -->
<!-- Title: chore(issues): resolve 12 of 30 ISSUES.md items + CI envs hoist + prettier fixup -->

## Summary

Resolves 12 of the 30 GitHub issues documented in `ISSUES.md`. Closes the bulk of cosmetic / refactor / i18n / UX-a11y / CI items; leaves heavier feature items (#2 ContactModal, #4 TrialOffer UI, #6 pay-to-contact modal, #8 useTrialOffer hook, #20 subscription status banner) for follow-up PRs.

## Stack (3 commits on this branch)

| Commit    | Description                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------- |
| `4752e35` | `chore(issues): resolve 12 of 30 ISSUES.md items` (#1, #11–17, #22, #24, #28, #29) — 18 files       |
| `203748a` | `chore(ci): hoist 28 placeholder envs to workflow-level (Issue #16)` — `.github/workflows/ci.yml`   |
| `3f06977` | `chore(format): prettier --write on 7 files from the prior chore(issues) commit` — whitespace fixup |

## Issues resolved

| #   | Title                                                 | Primary files                                                         |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| #1  | Scout public profile page                             | `app/[locale]/scout/[id]/page.tsx`, `hooks/useScoutProfile.ts`        |
| #11 | `PlayerFilterForm` uses shared `Select` component     | `components/scout/PlayerFilterForm.tsx`                               |
| #12 | `useScoutProfile` hook + tests                        | `hooks/useScoutProfile.ts`, `__tests__/hooks/useScoutProfile.test.ts` |
| #13 | SEP-10 session: handle expired cookies gracefully     | `context/WalletContext.tsx`, `components/ui/Toast.tsx`                |
| #14 | Albedo wallet: `isInstalled` check is unreliable      | `lib/walletAdapters.ts`, `context/WalletContext.tsx`                  |
| #15 | i18n: translate validator and admin page strings      | `messages/{en,fr,sw}.json`, `app/[locale]/validator/page.tsx`         |
| #16 | Improve CI: add build step                            | `.github/workflows/ci.yml`, `DEVELOPMENT.md`                          |
| #17 | Add `NEXT_PUBLIC_ADMIN_ADDRESS` validation            | `scripts/validate-env.js`, `.env.example`                             |
| #22 | Add `robots.txt` disallow for `/admin` and `/api`     | `public/robots.txt`, `next-sitemap.config.js`                         |
| #24 | Wire `ContractPausedBanner` into app layout           | `app/layout.tsx`                                                      |
| #28 | Accessibility: add `aria-live` to toast notifications | `components/ui/Toast.tsx`, `__tests__/components/Toast.test.tsx`      |
| #29 | Indexer: expose metrics via HTTP endpoint             | `packages/indexer/`, `DEVELOPMENT.md`                                 |

## Validation on this branch

| Check                                                          | Result                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| `npx tsc --noEmit -p tsconfig.typecheck.json` (excludes tests) | ✅ clean                                                |
| `npx eslint` (the 13 .ts/.tsx files touched)                   | ✅ 0 errors                                             |
| `npx prettier --check` (the 5 .md/.json/.yml files touched)    | ✅ 0 issues                                             |
| `npx next build` (with 28 placeholder envs)                    | ⚠️ blocked — addressed in PR 2 (`chore/lint-followups`) |

## Out-of-scope (pre-existing, NOT introduced by this branch)

These are documented separately and addressed in **PR 2 (`chore/lint-followups`)** which unblocks the build:

- 9 ESLint errors in `app/[locale]/recovery/page.tsx` (4) and `components/player/BackupWalletModal.tsx` (5); 1 `react-hooks/exhaustive-deps` warning in `components/scout/ReferralPanel.tsx`.

Pre-existing Jest infrastructure failures include:

- `TS1005: ',' expected` at `lib/api.ts:182:1` — a botched `redeemReferralCode` reorder left an orphan `export const` declaration that crashed the parser; **addressed by `test/fix-lib-api-parser`** on the user's fork (commit `d4949f3`).
- `Request is not defined` in `__tests__/app/api/admin/config-status.test.ts` and a snapshot drift in `__tests__/lib/logger.test.ts` — jsdom polyfill gap addressed by `test/jest-provider-helper` (commit `81f1639`).
- Remaining state-control failures for app-level renders that don't yet migrate to the `__tests__/setup-providers.tsx` helper — `test/jest-provider-helper` provides the API; migration is per-test-suite follow-up work.

None of these are introduced by this branch; addressed in separate test-infra cleanup PRs.
