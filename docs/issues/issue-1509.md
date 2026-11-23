# WIP: #1509 — include tests/stories/e2e in the repo type-check

This branch is intentionally left as a work-in-progress draft.

Reason:

- The repo currently has a large set of legacy tests, stories, and Playwright fixtures that are not yet compatible with a full-project `tsc` run.
- The root cause is broader than a single config file; it includes numerous ambient typing and strictness issues across legacy specs.
- This branch is created only to tie the issue to an upstream draft PR and keep the ticket visible while the repo-wide cleanup remains staged.

Planned work:

- Decide whether to keep the dedicated `tsconfig.typecheck.json` approach or fold the test files back into the main config.
- Add the required global types for jest, jest-dom, and Playwright.
- Fix the remaining legacy strictness issues in test fixtures and stories before enabling the gate in CI.
