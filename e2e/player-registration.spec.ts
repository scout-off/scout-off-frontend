import { test, expect } from './fixtures';
import { mockSorobanRpc } from './fixtures/mock-contract';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const MOCK_IPFS_CID =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

test.describe('wallet connect → player registration', () => {
  test('registers a player profile end to end with mocked contract calls', async ({
    page,
    wallet,
  }) => {
    mockSorobanRpc(page);

    await page.route('**/api/ipfs/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cid: MOCK_IPFS_CID }),
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

    await page.goto('/en/player');

    await page.getByLabel('Name *').fill('Ada Okafor');
    await page.getByLabel('Age *').fill('19');
    await page.getByLabel('Nationality *').fill('Nigeria');
    await page.getByLabel('Region *').selectOption({ label: 'Nigeria' });
    await page.getByLabel('Position *').selectOption({ label: 'Striker' });
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'highlight.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Register as Player' }).click();

    await expect(page.getByText(/registration complete/i)).toBeVisible({
      timeout: 60_000,
    });
  });
});
