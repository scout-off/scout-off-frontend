import { test, expect } from '@playwright/test';

// JavaScript off: whatever is asserted below came from the server render.
test.use({ javaScriptEnabled: false });

test.describe('Leaderboard SSR', () => {
  test('renders the page shell in the HTML response without JS', async ({
    page,
  }) => {
    await page.goto('/en/validator/leaderboard', { timeout: 60_000 });

    await expect(
      page.getByRole('heading', { name: 'Validator Leaderboard' }),
    ).toBeVisible();
    await expect(page.getByText(/Anyone can view this page/)).toBeVisible();
  });

  test('server-renders the ranked validator table without JS', async ({
    page,
  }) => {
    // The rows are read server-side from the deployed contract
    // (app/[locale]/validator/leaderboard/data.ts), which a browser-side
    // mock can't reach — this needs a real testnet deployment.
    test.skip(
      !process.env.E2E_CONTRACT_ID,
      'Requires a deployed testnet contract with validators. Set ' +
        'E2E_CONTRACT_ID to run this against real testnet — see e2e/README.md.',
    );

    await page.goto('/en/validator/leaderboard', { timeout: 60_000 });

    for (const column of ['Rank', 'Validator', 'Approvals']) {
      await expect(
        page.getByRole('columnheader', { name: column }),
      ).toBeVisible();
    }
    await expect(page.getByRole('row')).not.toHaveCount(0);
  });
});
