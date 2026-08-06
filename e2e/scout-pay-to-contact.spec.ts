import { test, expect } from './fixtures';
import { mockSorobanRpc } from './fixtures/mock-contract';

test.describe('scout browse / filter / pay-to-contact', () => {
  test('filters players, pays to contact, and opens ContactModal with copy', async ({
    page,
    wallet,
  }) => {
    mockSorobanRpc(page, {
      isValidator: false,
      subscription: {
        tier: 'pro',
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
    });

    await page.route('**/api/ipfs/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        }),
      });
    });

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();

    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/scout');

    await page.getByLabel(/region/i).selectOption({ label: 'Nigeria' });
    await page.getByLabel(/position/i).selectOption({ label: 'Striker' });
    await page.getByLabel(/level/i).selectOption({ label: 'Semi-Pro' });

    await expect(page.getByText('Test Player')).toBeVisible();

    await page
      .getByRole('button', { name: /pay to contact/i })
      .first()
      .click();

    await expect(page.getByText(/email/i)).toBeVisible({ timeout: 10_000 });

    const copyButton = page.getByRole('button', { name: /copy/i }).first();
    await copyButton.click();
  });
});
