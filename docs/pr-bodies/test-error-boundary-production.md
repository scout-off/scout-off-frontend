<!-- Branch: test/error-boundary-production -->
<!-- Title: test(error-boundary): lock in production-mode error detail suppression (Issue #23 AC #3) -->

## Summary

Locks in **Issue #23 AC #3** ("error details are not shown to end users in production") with a regression test. The `<pre>` block in `components/ui/ErrorBoundary.tsx` that surfaces `error.message + stack` is gated by `process.env.NODE_ENV !== 'production'`. Without an explicit test, a future refactor that breaks the gate — flipping the polarity, accidentally removing the conditional, or hardening it too aggressively — could silently regress the AC without any CI signal.

## Diff

`__tests__/components/ErrorBoundary.test.tsx` — adds 1 test (35 lines) that:

- Overrides `process.env.NODE_ENV` to `'production'` with `try/finally` restoration so the override doesn't leak to other tests.
- Asserts the recovery UI (`Something went wrong`, helpful subtext, `Try again` button) is _still_ rendered — guards against over-suppression.
- Asserts the throwing child's `error.message` regex is NOT in the DOM — locks in AC #3.

## Pattern

Mirrors `__tests__/app/layout.test.tsx` line 237 (`const prevNodeEnv = process.env.NODE_ENV; ...`), which already does the same override/restore dance.

## Validation

| Check                                                    | Result                |
| -------------------------------------------------------- | --------------------- |
| `npx tsc --noEmit -p tsconfig.typecheck.json`            | ✅ clean              |
| `npx eslint __tests__/components/ErrorBoundary.test.tsx` | ✅ clean              |
| `npx prettier --check` (same file)                       | ✅ clean              |
| `npx jest __tests__/components/ErrorBoundary.test.tsx`   | ✅ 7/7 pass (was 6/6) |
| `npx jest ... --ci`                                      | ✅ 7/7 pass           |
