import { test, expect } from './fixtures';

// 1x1 transparent PNG — VideoUpload accepts image/png and only cares that
// client-side validation passes; the actual upload is mocked below.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const MOCK_IPFS_CID =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

function truncated(publicKey: string) {
  return `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
}

async function connectFreighter(page: import('@playwright/test').Page) {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
}

test.describe('wallet connect', () => {
  test('connects via a real SEP-10 challenge signed by the mocked wallet', async ({
    page,
    wallet,
  }) => {
    await connectFreighter(page);

    // The button only flips to the connected/truncated-address state once
    // getPublicKey() *and* the full SEP-10 sign+verify round trip succeed —
    // this is exercising the harness's signing path against the real
    // app/api/auth/sep10 route, not a stub.
    await expect(page.getByText(truncated(wallet.publicKey))).toBeVisible();
  });

  test('surfaces a failure when the mocked wallet declines the challenge', async ({
    page,
    wallet,
  }) => {
    await wallet.setBehavior('reject');

    await connectFreighter(page);

    await expect(page.getByText(truncated(wallet.publicKey))).toHaveCount(0);
  });
});

test.describe('wallet connect → player registration', () => {
  test('registers a player profile end to end, including submitting the signed transaction to testnet', async ({
    page,
    wallet,
  }) => {
    test.skip(
      !process.env.E2E_CONTRACT_ID,
      'Requires a deployed testnet contract and a friendbot-funded test ' +
        `wallet (${wallet.publicKey}). Set E2E_CONTRACT_ID to run this ` +
        'against real testnet — see e2e/README.md.',
    );

    await page.route('**/api/ipfs/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cid: MOCK_IPFS_CID }),
      });
    });

    await connectFreighter(page);
    await expect(page.getByText(truncated(wallet.publicKey))).toBeVisible();

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

    // buildRegisterPlayer + signAndSubmit round-trip to the real Soroban RPC
    // configured via NEXT_PUBLIC_SOROBAN_RPC/NEXT_PUBLIC_CONTRACT_ID, signed
    // by the mock wallet's real Keypair — this is the "reaches testnet" step.
    await expect(page.getByText(/registration complete/i)).toBeVisible({
      timeout: 60_000,
    });
  });
});
