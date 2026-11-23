/**
 * E2E test: shared-device cache isolation
 *
 * In production the service worker could hold API responses in Cache
 * Storage. Personal routes are NetworkOnly (lib/pwaCacheConfig.ts, unit
 * tested in __tests__/lib/pwaCacheConfig.test.ts), and as a second line of
 * defence WalletContext calls clearUserCaches() on disconnect and on
 * connect. The e2e dev server runs with the service worker disabled
 * (next.config.js), so this spec seeds Cache Storage the way a production
 * worker would and checks that the app itself purges user A's entries
 * before user B can read them.
 */

import { test, expect } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';
import { installMockFreighter } from './fixtures/wallet-mock';
import { mockSorobanRpc } from './fixtures/mock-contract';

const WALLET_A_SECRET =
  'SACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINUQ';
const WALLET_A_ADDRESS = Keypair.fromSecret(WALLET_A_SECRET).publicKey();
const WALLET_B_SECRET =
  'SACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQLCMS';

function truncated(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Cache names and the URLs stored in each (opens every cache it lists). */
function cacheContents(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      out[name] = keys.map((r) => new URL(r.url).pathname);
    }
    return out;
  });
}

test.describe('Shared Device Cache Leak Prevention', () => {
  test("disconnecting purges the previous user's cached API data", async ({
    page,
  }) => {
    const wallet = await installMockFreighter(page, {
      secret: WALLET_A_SECRET,
    });
    mockSorobanRpc(page);

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(page.getByText(truncated(WALLET_A_ADDRESS))).toBeVisible();

    // What a production service worker could have stored for user A, next
    // to a static-asset cache that must survive a sign-out.
    await page.evaluate(async () => {
      const api = await caches.open('api-cache');
      await api.put(
        '/api/watchlist',
        new Response(JSON.stringify({ items: ['player-a-secret-data'] })),
      );
      const statics = await caches.open('static-assets');
      await statics.put('/icons/icon-192.png', new Response('png'));
    });
    expect(await cacheContents(page)).toMatchObject({
      'api-cache': ['/api/watchlist'],
    });

    // User A signs out on the shared device.
    await page
      .getByRole('button', {
        name: `Disconnect Wallet — ${truncated(WALLET_A_ADDRESS)}`,
      })
      .click();
    await page
      .getByRole('dialog', { name: 'Disconnect wallet?' })
      .getByRole('button', { name: 'Disconnect', exact: true })
      .click();
    await expect(page.getByText(truncated(WALLET_A_ADDRESS))).toHaveCount(0);

    // caches.match, not caches.open: opening a just-deleted cache would
    // re-create it (empty) and race the app's purge.
    await expect
      .poll(() =>
        page.evaluate(async () => ({
          watchlist: (await caches.match('/api/watchlist')) !== undefined,
          icon: (await caches.match('/icons/icon-192.png')) !== undefined,
        })),
      )
      .toEqual({ watchlist: false, icon: true });

    // User B signs in on the same browser and finds nothing of A's — even
    // offline, where only Cache Storage could answer.
    await wallet.switchAccount(WALLET_B_SECRET);
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(page.getByText(truncated(wallet.publicKey))).toBeVisible();

    await page.context().setOffline(true);
    const cached = await page.evaluate(async () => {
      const hit = await caches.match('/api/watchlist');
      return hit ? hit.text() : null;
    });
    expect(cached).toBeNull();
    await page.context().setOffline(false);
  });
});
