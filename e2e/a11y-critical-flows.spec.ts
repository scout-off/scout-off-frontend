import { test, expect } from './fixtures';
import { DEFAULT_PLAYER, mockSorobanRpc, scv } from './fixtures/mock-contract';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function connectWallet(page: import('@playwright/test').Page) {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet' }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
}

test.describe('keyboard accessibility for critical flows', () => {
  test('moves focus and announces onboarding steps', async ({ page }) => {
    test.skip(
      !process.env.E2E_CONTRACT_ID,
      'Requires a deployed testnet contract for the wallet-backed onboarding flow.',
    );

    await page.route('**/api/ipfs/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cid: 'QmKeyboardTestCid' }),
      });
    });
    await connectWallet(page);
    await page.goto('/en/player');

    const name = page.getByLabel('Name *');
    await name.focus();
    await page.keyboard.type('Keyboard Player');
    await page.keyboard.press('Tab');
    await page.keyboard.type('20');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Nigeria');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.getByRole('button', { name: 'Continue' }).press('Enter');

    await expect(
      page.getByRole('heading', { name: 'Highlight Reel' }),
    ).toBeFocused();
    await expect(page.getByRole('status')).toContainText('Step 2 of 3');

    await page.getByRole('button', { name: 'Continue' }).press('Enter');
    await expect(
      page.getByRole('alert', { name: 'Form validation summary' }),
    ).toBeFocused();
  });

  test('opens and closes pay-to-contact confirmation by keyboard', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(90_000);
    mockSorobanRpc(page, {
      isValidator: false,
      returns: { get_contact_fee: scv(1) },
    });
    await connectWallet(page);
    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();
    // Pay-to-contact lives on the player profile.
    await page.goto(`/en/player/${DEFAULT_PLAYER.id}`);

    const payButton = page.getByRole('button', { name: /^pay to contact/i });
    await expect(payButton).toBeVisible({ timeout: 60_000 });
    await payButton.focus();
    await page.keyboard.press('Enter');

    // The cookie-consent banner is also a dialog; scope to the modal one.
    const dialog = page.getByRole('dialog', { name: 'Contact Player' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
    await expect(
      dialog.getByRole('button', { name: /pay .* XLM to contact/i }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(payButton).toBeFocused();

    // Keep the fixture wallet referenced so this scenario remains tied to the
    // same authenticated keyboard flow as the existing pay-to-contact E2E.
    expect(wallet.publicKey).toMatch(/^G[A-Z2-7]{55}$/);
  });
});
