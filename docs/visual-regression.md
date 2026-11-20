# Visual Regression Testing (Storybook)

Storybook (`npm run storybook`) has no automated check for unintended visual
changes to UI components — a CSS tweak in one component can silently break
the look of another. This document covers the tool we chose, how the CI
check works, and how to review and approve visual changes.

## Tool choice

| Option                                                 | Cost                                                                                                                 | Verdict                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Chromatic**                                          | Free tier caps out at a low snapshot count/month and the project has no budget for a paid plan                       | Not adopted — would require either paying or frequently running out of quota mid-month                                  |
| **reg-suit**                                           | Free, self-hosted, but needs its own storage backend (S3/GCS) and plugin configuration to compare against a baseline | Not adopted — adds an external storage dependency for something Git already does natively via committed baseline images |
| **Playwright screenshot diffing** (`toHaveScreenshot`) | Free, no external service; `@playwright/test` is already a project dependency (used for `e2e/`)                      | **Adopted** — baselines are plain PNGs committed to the repo, diffed with Playwright's built-in pixelmatch comparison   |

## How it works

- `playwright.visual.config.ts` is a dedicated Playwright config (separate
  from `playwright.config.ts`, which drives the app's own `e2e/` suite and
  explicitly ignores `e2e/visual/**`) that boots Storybook's dev server and
  points at `e2e/visual/`.
- `e2e/visual/storybook.visual.spec.ts` reads Storybook's `/index.json` at
  run time and screenshots every story it finds — new stories get visual
  coverage automatically, without editing the spec.
- Baselines live alongside the spec in
  `e2e/visual/storybook.visual.spec.ts-snapshots/`, one PNG per story per
  project (see [Locales and viewports](#locales-and-viewports)).
- The `visual-regression` GitHub Actions workflow
  (`.github/workflows/visual-regression.yml`) runs the check on every push
  and PR against `main`, inside the same `mcr.microsoft.com/playwright`
  Docker image used for local baseline generation — screenshot rendering is
  sensitive to font and GPU differences, so both environments need to match
  or diffs become noisy false positives.

## Running it locally

```bash
# Compare against the committed baselines
npm run test:visual

# Regenerate baselines after an intentional visual change
npm run test:visual:update
```

Run these inside the same Docker image CI uses so your machine's font
rendering doesn't produce spurious diffs:

```bash
docker run --rm -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.61.1-noble \
  npx playwright test --config=playwright.visual.config.ts --update-snapshots
```

(Keep the image tag in sync with the `@playwright/test` version in
`package.json` and with `.github/workflows/visual-regression.yml`.)

## Locales and viewports

French and Swahili strings are often 20–40% longer than English, so
truncation and wrapping bugs only show up when a story renders in those
locales. `playwright.visual.config.ts` therefore defines one desktop and one
mobile (375px wide) project per locale:

| Project            | Locale | Viewport       |
| ------------------ | ------ | -------------- |
| `visual-en`        | en     | Desktop Chrome |
| `visual-en-mobile` | en     | 375 × 812      |
| `visual-fr`        | fr     | Desktop Chrome |
| `visual-fr-mobile` | fr     | 375 × 812      |
| `visual-sw`        | sw     | Desktop Chrome |
| `visual-sw-mobile` | sw     | 375 × 812      |

Each project passes its locale to Storybook as the `locale` global
(`&globals=locale:fr`), which `.storybook/preview.tsx` uses to pick the
`messages/<locale>.json` catalogue. The same "Locale" toolbar item lets you
check a story by hand in `npm run storybook`.

Baselines are stored per project through Playwright's default snapshot
suffix, e.g. `ui-button--primary-visual-fr-mobile-linux.png`.

To update baselines for a single locale or viewport, pass `--project`:

```bash
# Only French, desktop and mobile
npx playwright test --config=playwright.visual.config.ts \
  --project=visual-fr --project=visual-fr-mobile --update-snapshots
```

Or limit a whole run to some locales with `VISUAL_LOCALES`
(comma-separated, defaults to `en,fr,sw`), for example to keep CI time down
on PRs that don't touch `messages/`, `components/` or `app/`:

```bash
VISUAL_LOCALES=en npm run test:visual
```

When a French or Swahili screenshot shows text overflowing its container,
fix the component (`truncate` plus a `title` or tooltip, `min-w-0` on flex
children, or allowing the text to wrap) rather than shortening the
translation.

## Reviewing and approving a change

1. A PR that changes a component's visual output fails the
   `visual-regression` CI job. Diff images are attached in Playwright's
   HTML report, uploaded as the `visual-regression-report` workflow
   artifact.
2. Download the artifact and open `playwright-report/index.html` to see the
   expected/actual/diff images side by side for each failing story.
3. If the change is a **regression** (unintended), fix the component and
   push again.
4. If the change is **intentional**, run `npm run test:visual:update`
   locally (via the Docker image above), commit the updated PNGs under
   `e2e/visual/storybook.visual.spec.ts-snapshots/`, and call it out in the
   PR description so reviewers know which stories changed on purpose.
5. A reviewer should treat updated baseline PNGs the same as any other
   reviewed diff — check that the new screenshot actually matches the
   intended design before approving.
