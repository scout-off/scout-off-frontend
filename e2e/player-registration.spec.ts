import { test, expect } from './fixtures';
import { xdr } from '@stellar/stellar-sdk';
import {
  DEFAULT_PLAYER,
  mockSorobanRpc,
  scv,
  type SorobanRpcMock,
} from './fixtures/mock-contract';
import { MOCK_UPLOAD_CID, mockChunkedUploadApi } from './fixtures/mock-upload';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.describe('wallet connect → player registration', () => {
  test('registers a player profile end to end with mocked contract calls', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(120_000);
    // No profile for this wallet until register_player has been submitted;
    // afterwards get_player returns the new on-chain record.
    let rpc: SorobanRpcMock | null = null;
    rpc = mockSorobanRpc(page, {
      returns: {
        get_player: () =>
          rpc?.submitted.includes('register_player')
            ? scv({
                ...DEFAULT_PLAYER,
                id: wallet.publicKey,
                wallet: wallet.publicKey,
                vitals: { ...DEFAULT_PLAYER.vitals, name: 'Ada Okafor' },
                ipfsHash: MOCK_UPLOAD_CID,
                progressLevel: 0,
              })
            : xdr.ScVal.scvVoid(),
      },
    });

    mockChunkedUploadApi(page, { totalChunks: 1 });

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();

    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/player', { timeout: 60_000 });

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
