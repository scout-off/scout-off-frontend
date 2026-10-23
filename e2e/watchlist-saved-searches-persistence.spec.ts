/**
 * Watchlist & saved-search server-side persistence E2E (issue #1525).
 *
 * Verifies the user-facing promise introduced when these features moved from
 * localStorage to server stores (/api/watchlist, /api/saved-searches):
 *
 *   1. Items saved on "device A" appear immediately on "device B" (same
 *      wallet, different browser context, fresh cookies → new session).
 *   2. A different wallet on the same device sees only its own data — another
 *      wallet's watchlist/saved-searches are never leaked.
 *   3. Removals are also server-side: deleting on device A makes the entry
 *      disappear when device B subsequently fetches.
 *
 * No UI is driven for the cross-device assertions — the spec calls the
 * /api/watchlist and /api/saved-searches endpoints directly via the page's
 * authenticated fetch (same session cookie path as the real app), which is
 * faster and avoids coupling the test to UI layout changes.
 *
 * Authentication uses the same SEP-10 mock-wallet approach as
 * e2e/session-lifecycle.spec.ts — the wallet is mocked (wallet-mock.ts) but
 * every signature is real, so nothing in app/api/auth/** is stubbed.
 */

import { test, expect } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';
import { installMockFreighter } from './fixtures/wallet-mock';

// ---------------------------------------------------------------------------
// Test keypairs — deterministic, testnet-only, hold no real value.
// ---------------------------------------------------------------------------

const WALLET_A_SECRET =
  process.env.E2E_WALLET_SECRET ??
  'SBNYKPD5APY4SOASUVEICEPBSPWG6MJK5PMJKNOLES2PVZDLZ2ITUZWZ';
const WALLET_B_SECRET =
  process.env.E2E_ALT_WALLET_SECRET ??
  'SCWOMSHI7P4S2RX2LBKPRAUW7CS55JNWGQBZBRJPGXON7XBANX7OI5SP';

const WALLET_A_ADDRESS = Keypair.fromSecret(WALLET_A_SECRET).publicKey();
const WALLET_B_ADDRESS = Keypair.fromSecret(WALLET_B_SECRET).publicKey();

// A valid Stellar public key we can use as a fake "player ID" in watchlist
// tests — the watchlist API validates that playerId is a real Ed25519 key.
// We reuse wallet B's address for simplicity; it never has to be a real
// registered player for the API to store it.
const MOCK_PLAYER_ID = WALLET_B_ADDRESS;
const MOCK_PLAYER_ID_2 = Keypair.fromSecret(
  'SCZANGBA338W4BDBBZJULY5TCZFZEPKQE7BRFZQRJTWOPNLQOPJQR4AI',
).publicKey();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncated(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Navigates to /en, clicks "Connect Wallet" → "Freighter", and waits for the
 * wallet button to show the connected-address label. Returns when the session
 * cookie has been issued.
 */
async function connectWallet(
  page: import('@playwright/test').Page,
  publicKey: string,
): Promise<void> {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(
    page.getByRole('button', {
      name: `Disconnect Wallet — ${truncated(publicKey)}`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Makes a fetch call from within the page context so it carries the page's
 * session cookie. Returns the parsed JSON body.
 */
async function pageApiFetch<T>(
  page: import('@playwright/test').Page,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }: { path: string; init?: RequestInit }) => {
      const res = await fetch(path, init);
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    },
    { path, init },
  );
}

// ---------------------------------------------------------------------------
// Watchlist persistence
// ---------------------------------------------------------------------------

test.describe('Watchlist server-side persistence', () => {
  test.describe.configure({ mode: 'serial' });

  test('item added on device A appears on device B (same wallet)', async ({
    browser,
  }) => {
    // ── Device A: log in and add a watchlist entry ────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    // Verify the watchlist is empty to start.
    const initial = await pageApiFetch<unknown[]>(pageA, '/api/watchlist');
    expect(initial.status).toBe(200);
    // It may have items from a previous run; we'll clean up after.

    // Add MOCK_PLAYER_ID to the watchlist.
    const addResult = await pageApiFetch<{ id: number; playerId: string }>(
      pageA,
      '/api/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: MOCK_PLAYER_ID }),
      },
    );
    expect(addResult.status).toBe(201);
    const entryId = addResult.body.id;
    expect(typeof entryId).toBe('number');

    // ── Device B: fresh context, same wallet, new session ────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_A_SECRET });
    await connectWallet(pageB, WALLET_A_ADDRESS);

    // Device B must see the entry added by device A.
    const listB = await pageApiFetch<Array<{ id: number; playerId: string }>>(
      pageB,
      '/api/watchlist',
    );
    expect(listB.status).toBe(200);
    expect(listB.body.some((e) => e.playerId === MOCK_PLAYER_ID)).toBe(true);

    // ── Cleanup: remove the entry ────────────────────────────────────────
    await pageApiFetch(pageA, '/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entryId }),
    });

    await ctxA.close();
    await ctxB.close();
  });

  test('wallet B cannot see wallet A watchlist entries', async ({
    browser,
  }) => {
    // ── Wallet A: add an entry ────────────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const addResult = await pageApiFetch<{ id: number }>(
      pageA,
      '/api/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: MOCK_PLAYER_ID_2 }),
      },
    );
    expect(addResult.status).toBe(201);
    const entryId = addResult.body.id;

    // ── Wallet B: must NOT see wallet A's entry ──────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_B_SECRET });
    await connectWallet(pageB, WALLET_B_ADDRESS);

    const listB = await pageApiFetch<Array<{ playerId: string }>>(
      pageB,
      '/api/watchlist',
    );
    expect(listB.status).toBe(200);
    expect(listB.body.some((e) => e.playerId === MOCK_PLAYER_ID_2)).toBe(false);

    // ── Cleanup ──────────────────────────────────────────────────────────
    await pageApiFetch(pageA, '/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entryId }),
    });

    await ctxA.close();
    await ctxB.close();
  });

  test('deletion on device A is reflected on device B', async ({
    browser,
  }) => {
    // ── Device A: add, then delete ───────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const addResult = await pageApiFetch<{ id: number; playerId: string }>(
      pageA,
      '/api/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: MOCK_PLAYER_ID }),
      },
    );
    expect(addResult.status).toBe(201);
    const entryId = addResult.body.id;

    // Delete from device A.
    const delResult = await pageApiFetch(pageA, '/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entryId }),
    });
    expect((delResult as { status: number }).status).toBe(200);

    // ── Device B: entry must be gone ─────────────────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_A_SECRET });
    await connectWallet(pageB, WALLET_A_ADDRESS);

    const listB = await pageApiFetch<Array<{ id: number }>>(
      pageB,
      '/api/watchlist',
    );
    expect(listB.status).toBe(200);
    expect(listB.body.some((e) => e.id === entryId)).toBe(false);

    await ctxA.close();
    await ctxB.close();
  });

  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get('/api/watchlist');
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Saved-search persistence
// ---------------------------------------------------------------------------

test.describe('Saved-search server-side persistence', () => {
  test.describe.configure({ mode: 'serial' });

  const TEST_SEARCH_NAME = 'E2E test: top strikers';
  const TEST_FILTER = { position: 'ST', minAge: 18, maxAge: 25 };

  test('saved search created on device A appears on device B (same wallet)', async ({
    browser,
  }) => {
    // ── Device A: create a saved search ──────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const createResult = await pageApiFetch<{ id: number; name: string }>(
      pageA,
      '/api/saved-searches',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: TEST_SEARCH_NAME, filter: TEST_FILTER }),
      },
    );
    expect(createResult.status).toBe(201);
    const searchId = createResult.body.id;
    expect(createResult.body.name).toBe(TEST_SEARCH_NAME);

    // ── Device B: fresh context, same wallet, new session ─────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_A_SECRET });
    await connectWallet(pageB, WALLET_A_ADDRESS);

    const listB = await pageApiFetch<Array<{ id: number; name: string }>>(
      pageB,
      '/api/saved-searches',
    );
    expect(listB.status).toBe(200);
    const found = listB.body.find((s) => s.id === searchId);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_SEARCH_NAME);

    // ── Cleanup ──────────────────────────────────────────────────────────
    await pageApiFetch(pageA, '/api/saved-searches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: searchId }),
    });

    await ctxA.close();
    await ctxB.close();
  });

  test('wallet B cannot see wallet A saved searches', async ({ browser }) => {
    // ── Wallet A: create a saved search ───────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const createResult = await pageApiFetch<{ id: number }>(
      pageA,
      '/api/saved-searches',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Private search wallet A',
          filter: { position: 'GK' },
        }),
      },
    );
    expect(createResult.status).toBe(201);
    const searchId = createResult.body.id;

    // ── Wallet B: must NOT see wallet A's saved search ──────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_B_SECRET });
    await connectWallet(pageB, WALLET_B_ADDRESS);

    const listB = await pageApiFetch<Array<{ id: number }>>(
      pageB,
      '/api/saved-searches',
    );
    expect(listB.status).toBe(200);
    expect(listB.body.some((s) => s.id === searchId)).toBe(false);

    // ── Cleanup ──────────────────────────────────────────────────────────
    await pageApiFetch(pageA, '/api/saved-searches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: searchId }),
    });

    await ctxA.close();
    await ctxB.close();
  });

  test('rename on device A is reflected when device B fetches', async ({
    browser,
  }) => {
    // ── Device A: create ─────────────────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const createResult = await pageApiFetch<{
      id: number;
      name: string;
      version: number;
    }>(pageA, '/api/saved-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Before rename',
        filter: { position: 'CB' },
      }),
    });
    expect(createResult.status).toBe(201);
    const { id: searchId, version } = createResult.body;

    // Rename on device A.
    const renameResult = await pageApiFetch<{ id: number; name: string }>(
      pageA,
      '/api/saved-searches',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${version}"`,
        },
        body: JSON.stringify({ id: searchId, name: 'After rename' }),
      },
    );
    expect((renameResult as { status: number }).status).toBe(200);

    // ── Device B: sees the new name ───────────────────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_A_SECRET });
    await connectWallet(pageB, WALLET_A_ADDRESS);

    const listB = await pageApiFetch<Array<{ id: number; name: string }>>(
      pageB,
      '/api/saved-searches',
    );
    const found = listB.body.find((s) => s.id === searchId);
    expect(found?.name).toBe('After rename');

    // ── Cleanup ──────────────────────────────────────────────────────────
    await pageApiFetch(pageA, '/api/saved-searches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: searchId }),
    });

    await ctxA.close();
    await ctxB.close();
  });

  test('deletion on device A is reflected on device B', async ({
    browser,
  }) => {
    // ── Device A: create then delete ─────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await installMockFreighter(pageA, { secret: WALLET_A_SECRET });
    await connectWallet(pageA, WALLET_A_ADDRESS);

    const createResult = await pageApiFetch<{ id: number }>(
      pageA,
      '/api/saved-searches',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'To be deleted',
          filter: { position: 'LW' },
        }),
      },
    );
    expect(createResult.status).toBe(201);
    const searchId = createResult.body.id;

    // Delete from device A.
    await pageApiFetch(pageA, '/api/saved-searches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: searchId }),
    });

    // ── Device B: entry must be gone ─────────────────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await installMockFreighter(pageB, { secret: WALLET_A_SECRET });
    await connectWallet(pageB, WALLET_A_ADDRESS);

    const listB = await pageApiFetch<Array<{ id: number }>>(
      pageB,
      '/api/saved-searches',
    );
    expect(listB.status).toBe(200);
    expect(listB.body.some((s) => s.id === searchId)).toBe(false);

    await ctxA.close();
    await ctxB.close();
  });

  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get('/api/saved-searches');
    expect(res.status()).toBe(401);
  });
});
