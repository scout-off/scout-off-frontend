<!-- Branch: chore/lint-followups -->
<!-- Title: chore(lint): fix 8 unescaped-entities + 1 exhaustive-deps blocking the build CI job -->

## Summary

Unblocks the new `build` CI job introduced in #16 (which hoists the 28 placeholder envs to workflow-level). `next build` calls ESLint with Next's default config; the 9 lint findings below turn the build red, so it never gets a chance to run.

## What's changed (3 files, +9/-9)

- **`app/[locale]/recovery/page.tsx`** — 4 `react/no-unescaped-entities` errors at lines 113:67, 276:31, 277:32, 278:34. Fixed by replacing `'` with `&apos;` in JSX text. Browser-decoded output identical.
- **`components/player/BackupWalletModal.tsx`** — 5 `react/no-unescaped-entities` errors at lines 210:80, 270:21, 270:33, 313:56, 344:62. Fixed in 4 `str_replace` ops: line 210 (`You'll` → `You&apos;ll`); line 270 (`Click "Link & Sign"` → `Click &quot;Link &amp; Sign&quot;` — escapes both quotes and the ampersand); lines 313/344 (`'` → `&apos;`).
- **`components/scout/ReferralPanel.tsx`** — 1 `react-hooks/exhaustive-deps` warning at line 119:6 on `handleGenerate` `useCallback`. Added `turnstileToken` to the deps array. Verified the handler has no memoized consumers and `turnstileToken` only changes in response to user-triggered events (Turnstile challenge complete, expiry, error), so the dep change is safe.

## Validation

| Check                                         | Result                  |
| --------------------------------------------- | ----------------------- |
| `npx eslint` (3 files)                        | ✅ 0 errors, 0 warnings |
| `npx prettier --check` (3 files)              | ✅ clean                |
| `npx tsc --noEmit -p tsconfig.typecheck.json` | ✅ clean                |

## Out-of-scope (pre-existing, NOT introduced by this branch)

`ScoutDashboard.test.tsx` test infrastructure failures (missing `ToastProvider` wrapper) are also present on the parent commit — confirmed by checking out `chore/resolve-30-issues` and re-running. Cause: missing `ToastProvider` wrapper in the test setup. Test-infra cleanup item, addressed in `test/jest-provider-helper` branch on the user's fork.
