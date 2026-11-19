import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression config.
 *
 * Each project pins a locale + direction so snapshots catch RTL/LTR drift.
 * The `ar` project renders the app with `dir="rtl"` (see `lib/rtl.ts` and the
 * `<html dir>` wiring in `app/layout.tsx`) so logical-property regressions
 * surface as snapshot diffs.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

const RTL_PAGES = [
  { name: 'landing', path: '/ar' },
  { name: 'scout', path: '/ar/scout' },
  { name: 'player-profile', path: '/ar/players/1' },
  { name: 'onboarding', path: '/ar/onboarding' },
  { name: 'changelog', path: '/ar/changelog' },
];

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ltr-chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
      },
    },
    {
      name: 'ar-chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'ar-EG',
        extraHTTPHeaders: {
          'Accept-Language': 'ar-EG,ar;q=0.9',
        },
      },
      metadata: {
        direction: 'rtl',
        pages: RTL_PAGES,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run start',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
