import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DEFAULT_PLAYER, mockSorobanRpc, scv } from './fixtures/mock-contract';
import { mockIndexer } from './fixtures/mock-indexer';
import fr from '../messages/fr.json';
import sw from '../messages/sw.json';

/**
 * i18n smoke tests (#1710): condensed critical flows in fr and sw that fail
 * on raw message keys in the page or next-intl errors in the console. The
 * full flows stay in their own English specs; these only check rendering.
 */
const LOCALES = { fr, sw } as const;

const NEXT_INTL_ERROR = /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/;

/** Collects next-intl errors from the browser console and uncaught errors. */
function watchIntlErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && NEXT_INTL_ERROR.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    if (NEXT_INTL_ERROR.test(err.message)) errors.push(err.message);
  });
  return errors;
}

/** Visible text nodes that look like an untranslated `namespace.key`. */
function findRawKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rawKey = /^[a-z_]+(\.[a-z_]+)+$/;
    const found: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim() ?? '';
      const el = walker.currentNode.parentElement;
      if (!el || !rawKey.test(text)) continue;
      if (el.closest('script, style, noscript')) continue;
      if (!el.checkVisibility()) continue;
      found.push(text);
    }
    return found;
  });
}

async function expectLocalized(page: Page, locale: string, errors: string[]) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  expect(await findRawKeys(page)).toEqual([]);
  expect(errors).toEqual([]);
}

async function connectWallet(
  page: Page,
  locale: keyof typeof LOCALES,
  publicKey: string,
) {
  await page.goto(`/${locale}`);
  await page
    .getByRole('button', { name: LOCALES[locale].common.connect_wallet })
    .first()
    .click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(
    page.getByText(`${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`),
  ).toBeVisible();
}

for (const locale of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
  const messages = LOCALES[locale];

  test.describe(`i18n smoke (${locale})`, () => {
    test('landing → connect wallet → player registration first step', async ({
      page,
      wallet,
    }) => {
      test.setTimeout(90_000);
      const errors = watchIntlErrors(page);

      await connectWallet(page, locale, wallet.publicKey);
      await expectLocalized(page, locale, errors);

      await page.goto(`/${locale}/player`, { timeout: 60_000 });
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages.player_dashboard.title,
        }),
      ).toBeVisible();
      await expectLocalized(page, locale, errors);
    });

    test('scout search → player profile → pay-to-contact modal', async ({
      page,
      wallet,
    }) => {
      test.setTimeout(120_000);
      const errors = watchIntlErrors(page);
      mockSorobanRpc(page, {
        isValidator: false,
        returns: { get_contact_fee: scv(1) },
      });
      mockIndexer(page, [DEFAULT_PLAYER]);
      await page.route('**/moderation/blocks/*/status', (route) =>
        route.fulfill({ json: { blocked: false } }),
      );

      await connectWallet(page, locale, wallet.publicKey);
      await page.goto(`/${locale}/scout`, { timeout: 60_000 });
      const card = page.getByRole('article', { name: /Test Player/ });
      await expect(card).toBeVisible();
      await expectLocalized(page, locale, errors);

      await card.click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/player/${DEFAULT_PLAYER.id}$`),
        { timeout: 60_000 },
      );
      await expectLocalized(page, locale, errors);

      // Open the modal only; no payment is submitted.
      await page.getByRole('button', { name: /^Pay to Contact/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectLocalized(page, locale, errors);
    });

    test('validator queue renders', async ({ page, wallet }) => {
      test.setTimeout(90_000);
      const errors = watchIntlErrors(page);
      mockSorobanRpc(page, {
        isValidator: true,
        returns: {
          get_validators: scv([
            { address: wallet.publicKey, addedAt: 1_700_000_000 },
          ]),
          get_player: scv(DEFAULT_PLAYER),
        },
      });
      mockIndexer(page);

      await connectWallet(page, locale, wallet.publicKey);
      await page.goto(`/${locale}/validator`, { timeout: 60_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectLocalized(page, locale, errors);
    });
  });
}
