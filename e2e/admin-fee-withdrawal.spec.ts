/**
 * E2E test: Admin fee withdrawal flow
 *
 * Verifies that an admin wallet can complete the fee withdrawal flow on
 * /admin/fees (split out of the overview in #1354):
 * 1. See accumulated platform fees
 * 2. Click withdraw button
 * 3. Confirm the action
 * 4. The withdraw_fees transaction is signed, submitted and confirmed
 *
 * Contract reads and the submission go to the mocked Soroban RPC
 * (e2e/fixtures/mock-contract.ts); signing is done by the mocked wallet.
 *
 * Issue #529
 */

import { test, expect } from '@playwright/test';
import { installMockFreighter } from './fixtures/wallet-mock';
import { mockSorobanRpc, type SimulateOptions } from './fixtures/mock-contract';
import {
  E2E_ADMIN_ADDRESS as ADMIN_ADDRESS,
  E2E_ADMIN_SECRET as ADMIN_SECRET,
} from './fixtures/admin';

const ACCUMULATED_FEES_XLM = 5;

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

async function openFeesPage(
  page: import('@playwright/test').Page,
  contract: SimulateOptions = { platformFees: ACCUMULATED_FEES_XLM },
) {
  await installMockFreighter(page, { secret: ADMIN_SECRET });
  const rpc = mockSorobanRpc(page, contract);

  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(page.getByText(truncateAddress(ADMIN_ADDRESS))).toBeVisible();

  await page.goto('/en/admin/fees');
  await expect(
    page.getByRole('heading', { name: 'Fees', exact: true }),
  ).toBeVisible();
  return rpc;
}

function feesSection(page: import('@playwright/test').Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: 'Platform Fees' }),
  });
}

test.describe('Admin fee withdrawal', () => {
  test('displays accumulated platform fees', async ({ page }) => {
    await openFeesPage(page);
    await expect(feesSection(page).getByText(/5\.00 XLM/)).toBeVisible();
  });

  test('withdraw button is enabled when fees are available', async ({
    page,
  }) => {
    await openFeesPage(page);
    await expect(
      page.getByRole('button', { name: 'Withdraw Fees' }),
    ).toBeEnabled();
  });

  test('shows confirmation dialog with correct fee amount and can cancel', async ({
    page,
  }) => {
    const rpc = await openFeesPage(page);

    await page.getByRole('button', { name: 'Withdraw Fees' }).click();
    const prompt = page.getByText('Withdraw 5.00 XLM to your wallet?');
    await expect(prompt).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(prompt).toBeHidden();
    expect(rpc.submitted).toEqual([]);
  });

  test('completes fee withdrawal flow with confirmation', async ({ page }) => {
    const rpc = await openFeesPage(page);

    await page.getByRole('button', { name: 'Withdraw Fees' }).click();
    // The cookie-consent banner is also a dialog; scope to the confirm one.
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Withdraw 5.00 XLM to your wallet?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Withdraw Fees' }).click();

    await expect(dialog).toBeHidden();
    await expect.poll(() => rpc.submitted).toEqual(['withdraw_fees']);
  });

  test('withdraw button is disabled when contract is paused', async ({
    page,
  }) => {
    await openFeesPage(page, {
      platformFees: ACCUMULATED_FEES_XLM,
      isPaused: true,
    });

    const withdrawButton = page.getByRole('button', { name: 'Withdraw Fees' });
    await expect(withdrawButton).toBeDisabled();
    await expect(withdrawButton).toHaveAttribute(
      'title',
      'Contract is currently paused',
    );
  });

  test('withdraw button is disabled when no fees are available', async ({
    page,
  }) => {
    await openFeesPage(page, { platformFees: 0 });

    await expect(feesSection(page).getByText(/0\.00 XLM/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Withdraw Fees' }),
    ).toBeDisabled();
  });
});
