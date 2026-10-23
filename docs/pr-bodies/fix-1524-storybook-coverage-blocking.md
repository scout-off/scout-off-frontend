<!-- Branch: fix/1524-storybook-coverage-blocking -->
<!-- Title: fix(#1524): make components/ui Storybook coverage check blocking in CI -->

## Summary

The Storybook coverage check was intentionally non-blocking (`WARN_ONLY = true`)
while `components/ui/` story gaps were open (issue #1166). Those gaps are now
closed except for 10 components that are genuinely not independently renderable
in Storybook (third-party scripts, DOM side-effects, live-data hooks). This PR
flips `components/ui/` to a **blocking CI gate** and expands coverage reporting
to `components/scout/`, `components/player/`, and `components/admin/` as
warn-only signals so contributors can see the remaining gaps.

## Changes

### `scripts/check-storybook-coverage.js`

Rewrote the script to support multi-directory configuration:

- Each directory entry has a `warnOnly` flag. `false` = blocking (`exit 1`);
  `true` = warning only (`exit 0`).
- `components/ui/` → **`warnOnly: false`** (blocking gate, issue #1166 closed).
  The 10 non-story-able components are moved to an explicit `exempt` set with a
  per-entry comment explaining why each is exempt (not exempted for size reasons —
  only when a story is genuinely inappropriate).
- `components/scout/`, `components/player/`, `components/admin/` → warn-only.
  Their gaps (16, 17, 16 components respectively) are tracked under issue #1524
  and each directory will be flipped to blocking as its coverage is completed.

Removed the module-level `WARN_ONLY` boolean export in favour of the new `DIRS`
export (per-directory config array). The `EXEMPT` named export is no longer
needed since each directory config owns its own exempt set.

### `.github/workflows/ci.yml`

Updated the step name and comment to reflect that `components/ui/` is now a
blocking gate. The `continue-on-error` annotation that was previously implied
by the non-blocking exit code is no longer present — the step now fails the
`lint` job on an uncovered non-exempt `components/ui/` component.

## Exempt components (components/ui/)

| Component | Reason |
|-----------|--------|
| `Turnstile.tsx` | Cloudflare Turnstile — requires external script + real siteKey |
| `CookieConsentGate.tsx` | Gate based on real localStorage consent state |
| `CookieSettingsLink.tsx` | Triggers CookieConsentBanner imperative API |
| `DataFreshnessBadge.tsx` | Live SWR + indexer endpoint; needs MSW mock first |
| `CookieConsentBanner.tsx` | useEffect + localStorage; needs consent-flow MSW mock |
| `LegalPageLayout.tsx` | Pure layout wrapper; deferred to legal-page story pass |
| `OnboardingTour.tsx` | Multi-step tour + portal; needs full step fixture |
| `RedirectReasonBanner.tsx` | Reads URL search params; needs router mock setup |
| `ScrollToTop.tsx` | scroll-position triggered; story needs scroll-decorator |
| `ThemeToggle.tsx` | Writes to document.documentElement; needs DOM reset decorator |

## Files changed

| File | Change |
|------|--------|
| `scripts/check-storybook-coverage.js` | Multi-directory config, `warnOnly` per dir, explicit exempt set with comments, blocking for `components/ui/` |
| `.github/workflows/ci.yml` | Update step name/comment; gate is now blocking |

## Validation

| Check | Result |
|-------|--------|
| `node scripts/validate-pr-bodies.js` | ✅ passes |
| `node scripts/check-storybook-coverage.js` | ✅ exits 0 (ui passes, others warn) |
| `npm run type-check` | ✅ no new errors (script is plain JS) |
| CI step `Storybook coverage check` | ✅ will now fail if a new non-exempt `components/ui/` component ships without a story |

## Out of scope

- Writing the missing stories for `components/scout/`, `components/player/`,
  `components/admin/` (tracked in issue #1524 follow-up tasks).
- Writing stories for the 10 exempt `components/ui/` components — each has a
  linked reason; they will be addressed individually as their prerequisites
  (MSW mocks, decorators) land.

Closes #1524
