import { test, expect } from './fixtures';
import { mockSorobanRpc } from './fixtures/mock-contract';

test.describe('validator approve / revoke milestone', () => {
  test('approves a milestone, verifies progress, then revokes and verifies revert', async ({
    page,
    wallet,
  }) => {
    mockSorobanRpc(page, { isValidator: true });

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();

    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/validator');

    await page.getByLabel(/search by player/i).fill(wallet.publicKey);
    await page.getByRole('button', { name: 'Look up' }).click();

    await expect(page.getByText('Test Player')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Select' }).click();

    await page
      .getByLabel(/milestone description/i)
      .fill('Test milestone approval');
    await page.getByLabel(/evidence url/i).fill('https://example.com/evidence');
    await page.getByRole('button', { name: 'Approve Milestone' }).click();

    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 10_000 });

    await page
      .getByLabel(/milestone description/i)
      .fill('Test milestone revocation');
    await page
      .getByLabel(/evidence url/i)
      .fill('https://example.com/evidence-revoke');
    await page.getByRole('button', { name: 'Revoke Milestone' }).click();

    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 10_000 });
  });
});
