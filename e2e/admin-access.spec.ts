/**
 * E2E test: Admin access control
 *
 * Verifies that:
 * 1. Non-admin wallets are bounced off /admin by the AdminShell guard
 * 2. The admin wallet (e2e/fixtures/admin.ts, wired into
 *    NEXT_PUBLIC_ADMIN_ADDRESS by playwright.config.ts) sees the panel
 *
 * Issue #529
 */

import { test, expect } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';
import { installMockFreighter } from './fixtures/wallet-mock';
import { mockSorobanRpc } from './fixtures/mock-contract';
import {
  E2E_ADMIN_ADDRESS as ADMIN_ADDRESS,
  E2E_ADMIN_SECRET as ADMIN_SECRET,
} from './fixtures/admin';

// Non-admin test wallet (different from admin)
const NON_ADMIN_SECRET =
  'SABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNE7';
const NON_ADMIN_ADDRESS = Keypair.fromSecret(NON_ADMIN_SECRET).publicKey();

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

async function connectWallet(
  page: import('@playwright/test').Page,
  address: string,
) {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(page.getByText(truncateAddress(address))).toBeVisible();
}

test.describe('Admin access control', () => {
  test('non-admin wallet is redirected away from /admin with a toast', async ({
    page,
  }) => {
    expect(NON_ADMIN_ADDRESS).not.toBe(ADMIN_ADDRESS);
    await installMockFreighter(page, { secret: NON_ADMIN_SECRET });
    mockSorobanRpc(page);
    await connectWallet(page, NON_ADMIN_ADDRESS);

    await page.goto('/en/admin');

    await expect(
      page.getByText('Unauthorized: admin wallet required.'),
    ).toBeVisible();
    // AdminShell redirects with router.replace — a client-side navigation,
    // so assert on the URL rather than waiting for a load event.
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }),
    ).toHaveCount(0);
  });

  test('admin wallet sees the admin overview and section nav', async ({
    page,
  }) => {
    await installMockFreighter(page, { secret: ADMIN_SECRET });
    mockSorobanRpc(page);
    await connectWallet(page, ADMIN_ADDRESS);

    await page.goto('/en/admin');

    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Circuit Breaker' }),
    ).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    for (const section of ['Overview', 'Validators', 'Fees', 'Audit Log']) {
      await expect(nav.getByRole('link', { name: section })).toBeVisible();
    }
  });

  test('admin overview shows the configured contract ID', async ({ page }) => {
    await installMockFreighter(page, { secret: ADMIN_SECRET });
    mockSorobanRpc(page);
    await connectWallet(page, ADMIN_ADDRESS);

    await page.goto('/en/admin');

    const contractSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Contract', exact: true }),
    });
    await expect(contractSection.locator('code')).toHaveText(/^C[A-Z2-7]{55}$/);
  });
});
