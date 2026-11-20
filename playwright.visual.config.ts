import { defineConfig, devices } from '@playwright/test';

// Matches the fixed port in the `storybook` npm script (storybook dev -p 6006).
const BASE_URL = 'http://127.0.0.1:6006';

const ALL_LOCALES = ['en', 'fr', 'sw'];
const VISUAL_LOCALES = (process.env.VISUAL_LOCALES ?? ALL_LOCALES.join(','))
  .split(',')
  .map((l) => l.trim())
  .filter((l) => ALL_LOCALES.includes(l));

// Self-hosted visual regression for Storybook (Issue #539). Runs against the
// Storybook dev server directly (no static build/serve step needed) and
// screenshots every story via Playwright's built-in `toHaveScreenshot`
// baseline diffing.
//
// Screenshot rendering is sensitive to fonts/GPU, so both local baseline
// generation and CI run inside the same pinned `mcr.microsoft.com/playwright`
// Docker image (see .github/workflows/visual-regression.yml and
// docs/visual-regression.md) to keep results reproducible across machines.
export default defineConfig({
  testDir: './e2e/visual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Allow a small amount of anti-aliasing / sub-pixel drift without
      // failing the run outright — real regressions are far larger than this.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // Containers commonly ship a tiny /dev/shm; Chromium's default shared-memory
    // usage can crash mid-run there, so fall back to disk-backed shared memory.
    launchOptions: { args: ['--disable-dev-shm-usage'] },
  },
  // One desktop and one 375px-wide mobile project per locale (#1704): French
  // and Swahili strings run 20–40% longer than English, so truncation and
  // wrapping bugs only show up when the same stories render in those locales.
  // The spec reads `metadata.locale` and sets Storybook's locale global.
  // Baselines are per project (Playwright's default `{-projectName}` suffix).
  // VISUAL_LOCALES=en (comma-separated) limits a run to a subset of locales.
  projects: VISUAL_LOCALES.flatMap((locale) => [
    {
      name: `visual-${locale}`,
      metadata: { locale },
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: `visual-${locale}-mobile`,
      metadata: { locale },
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },
  ]),
  webServer: {
    command: 'npm run storybook -- --ci --quiet',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
