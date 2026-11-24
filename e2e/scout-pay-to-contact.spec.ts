import { test, expect } from './fixtures';
import { DEFAULT_PLAYER, mockSorobanRpc, scv } from './fixtures/mock-contract';
import { mockIndexer } from './fixtures/mock-indexer';

const CONTACT_EMAIL = 'ada.agent@example.com';

test.describe('scout browse / filter / pay-to-contact', () => {
  test('filters players, pays to contact, and opens ContactModal with copy', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(120_000);
    const rpc = mockSorobanRpc(page, {
      isValidator: false,
      returns: { get_contact_fee: scv(1) },
    });
    mockIndexer(page, [
      DEFAULT_PLAYER,
      {
        ...DEFAULT_PLAYER,
        id: 'P99999',
        vitals: {
          ...DEFAULT_PLAYER.vitals,
          name: 'Ghana Keeper',
          region: 'Ghana',
        },
      },
    ]);
    // The chat backend's block check (lib/messaging/moderation.ts).
    await page.route('**/moderation/blocks/*/status', (route) =>
      route.fulfill({ json: { blocked: false } }),
    );
    // The server vault's release endpoint, answered after payment.
    await page.route(`**/api/contact/${DEFAULT_PLAYER.id}`, (route) =>
      route.fulfill({ json: { email: CONTACT_EMAIL } }),
    );

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/scout');
    await page.getByLabel('Region').selectOption({ label: 'Nigeria' });
    await page.getByLabel('Position').selectOption({ label: 'Striker' });
    await page.getByLabel('Min Level').selectOption({ label: 'Verified' });

    const card = page.getByRole('article', { name: /Test Player/ });
    await expect(card).toBeVisible();
    await expect(page.getByText('Ghana Keeper')).toHaveCount(0);

    await card.click();
    // First visit compiles the profile route on the dev server.
    await expect(page).toHaveURL(new RegExp(`/player/${DEFAULT_PLAYER.id}$`), {
      timeout: 60_000,
    });

    await page.getByRole('button', { name: /^Pay to Contact/ }).click();
    await page.getByRole('button', { name: /^Pay 1 XLM to contact$/ }).click();

    const contactDialog = page
      .getByRole('dialog')
      .filter({ hasText: `Email: ${CONTACT_EMAIL}` });
    await expect(contactDialog).toBeVisible();
    expect(rpc.submitted).toContain('pay_to_contact');
    await contactDialog
      .getByRole('button', { name: 'Copy', exact: true })
      .first()
      .click();
  });
});
