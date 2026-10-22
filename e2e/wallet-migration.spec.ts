/**
 * Wallet migration E2E (issue #1505).
 *
 * Tests the full off-chain data migration flow:
 *   POST /api/migration/request  — toWallet submits request for fromWallet's data
 *   POST /api/migration/test-advance  — back-dates cooling-off for test speed
 *   POST /api/migration/execute  — toWallet executes after cooling-off elapsed
 *   POST /api/migration/cancel   — either wallet can cancel during cooling-off
 *
 * The wallets are mocked (e2e/fixtures/wallet-mock.ts) so real SEP-10
 * challenge/response is used, but no Freighter extension is required.
 * API calls use page.evaluate(...fetch...) to carry the real httpOnly session
 * cookies, exactly as the app does.
 *
 * Three scenarios:
 *   1. Happy path — seed data for wallet A → migrate to wallet B → verify
 *      counts in the execute response, session revoked for A, data present for B.
 *   2. Cancel path — request created → cancelled by fromWallet → nothing moved.
 *   3. Negative cases — execute without request, mismatched wallet auth, execute
 *      during cooling-off.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, E2E_ALT_WALLET_SECRET } from './fixtures';
import { installMockFreighter } from './fixtures/wallet-mock';

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from session-lifecycle.spec.ts)
// ---------------------------------------------------------------------------

function truncated(publicKey: string): string {
  return `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
}

function connectedButton(page: Page, publicKey: string) {
  return page.getByRole('button', {
    name: `Disconnect Wallet — ${truncated(publicKey)}`,
    exact: true,
  });
}

function connectButton(page: Page) {
  return page.getByRole('button', { name: 'Connect Wallet', exact: true });
}

/** Navigates to the home page and completes a real SEP-10 login. */
async function connect(page: Page, publicKey: string): Promise<void> {
  await page.goto('/en');
  await connectButton(page).click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(connectedButton(page, publicKey)).toBeVisible();
}

/** Makes an authenticated API call using the page's session cookies. */
async function apiRequest(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    ({ path, method, body }) =>
      fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) })),
    { path, method, body },
  );
}

/** Status only — for compact assertions. */
async function apiStatus(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
): Promise<number> {
  return (await apiRequest(page, path, method, body)).status;
}

async function readCookie(context: BrowserContext, name: string) {
  return (await context.cookies()).find((c) => c.name === name);
}

/**
 * Back-dates the cooling-off period so POST /api/migration/execute passes
 * immediately without waiting 72 real hours. Uses the test-only endpoint
 * that is disabled in production (returns 404 when NODE_ENV=production).
 */
async function advanceCoolingOff(page: Page, requestId: string): Promise<void> {
  const res = await apiRequest(page, '/api/migration/test-advance', 'POST', {
    requestId,
  });
  expect(res.status, 'test-advance must succeed in dev/test mode').toBe(200);
}

// ---------------------------------------------------------------------------
// Fixture key pairs
//
// wallet A  = E2E_TEST_WALLET_SECRET  (main fixture wallet)
// wallet B  = E2E_ALT_WALLET_SECRET   (alternate/backup wallet)
//
// The fixture `wallet` provided by the base test is wallet A (fromWallet).
// We install wallet B on a second page/context for the toWallet role.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scenario 1 — Happy path
// ---------------------------------------------------------------------------
test.describe.serial('happy path: request → execute → data under new wallet', () => {
  test('seeds data for wallet A and migrates it to wallet B', async ({
    page,
    context,
    wallet: walletA,
  }) => {
    test.setTimeout(90_000);

    // ----- Step 1: Log in as wallet A and seed off-chain data -----
    await connect(page, walletA.publicKey);

    // Two valid Stellar public keys used as fake player IDs.
    // Any valid G... address is accepted by the watchlist store layer.
    // These are derived from the well-known E2E test keypairs (safe to commit).
    const playerA = 'GBEJGP2RWKAO7LGFHBPFHZV7LDUHXSEHQ4XQOPEK26YXRUEHSKGICQ3A';
    const playerB = 'GA2FVN5BW56RS2W2DURP257O5YDTLICTMVBMTHQX3BJNSEGCCGAG5IFH';

    // Seed watchlist
    const wl1 = await apiRequest(page, '/api/watchlist', 'POST', { playerId: playerA });
    expect(wl1.status, 'watchlist add 1').toBe(201);
    const wl2 = await apiRequest(page, '/api/watchlist', 'POST', { playerId: playerB });
    expect(wl2.status, 'watchlist add 2').toBe(201);

    // Seed saved search
    const ss = await apiRequest(page, '/api/saved-searches', 'POST', {
      name: 'Top strikers East Africa',
      filter: { region: 'East Africa', position: 'ST', minLevel: 1 },
    });
    expect(ss.status, 'saved search add').toBe(201);

    // Seed notification preferences (turn off contactUnlocks)
    const np = await apiRequest(page, '/api/notification-preferences', 'PUT', {
      milestoneApprovals: true,
      contactUnlocks: false,
    });
    expect(np.status, 'notification prefs set').toBe(200);

    // Seed recently viewed
    const rv = await apiRequest(page, '/api/recently-viewed', 'POST', {
      playerId: playerA,
      viewedAt: Date.now() - 1000,
    });
    expect(rv.status, 'recently viewed add').toBe(201);

    // Confirm data is present for wallet A
    const watchlistA = await apiRequest(page, '/api/watchlist');
    expect(watchlistA.status).toBe(200);
    expect((watchlistA.body as { length: number }).length ?? (watchlistA.body as unknown[]).length).toBeGreaterThanOrEqual(2);

    // ----- Step 2: Open a second browser context as wallet B (toWallet) -----
    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    // ----- Step 3: Wallet B submits migration request for wallet A's data -----
    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status, 'POST /api/migration/request must return 201').toBe(201);

    const migRequest = reqRes.body as {
      id: string;
      fromWallet: string;
      toWallet: string;
      status: string;
      executeAfter: number;
    };
    expect(migRequest.id, 'response must include request id').toBeTruthy();
    expect(migRequest.fromWallet).toBe(walletA.publicKey);
    expect(migRequest.toWallet).toBe(walletB.publicKey);
    expect(migRequest.status).toBe('pending');
    expect(migRequest.executeAfter).toBeGreaterThan(Date.now());

    // ----- Step 4: Back-date cooling-off so execute can proceed immediately -----
    await advanceCoolingOff(pageB, migRequest.id);

    // ----- Step 5: Wallet B executes the migration -----
    const execRes = await apiRequest(pageB, '/api/migration/execute', 'POST', {
      requestId: migRequest.id,
    });
    expect(execRes.status, 'POST /api/migration/execute must return 200').toBe(200);

    const execBody = execRes.body as {
      request: { id: string; status: string };
      migration: {
        fromWallet: string;
        toWallet: string;
        counts: {
          watchlist: number;
          savedSearches: number;
          notificationPrefsTransferred: boolean;
          notificationReadIds: number;
          recentlyViewed: number;
          sessionsRevoked: number;
        };
        onChainTransferBlocked: { reason: string; trackingIssue: string };
      };
    };

    // Verify migration request is now completed
    expect(execBody.request.status, 'request must be completed').toBe('completed');

    // Verify counts match what we seeded
    const counts = execBody.migration.counts;
    expect(counts.watchlist, 'watchlist count must be ≥ 2').toBeGreaterThanOrEqual(2);
    expect(counts.savedSearches, 'savedSearches count must be ≥ 1').toBeGreaterThanOrEqual(1);
    expect(counts.notificationPrefsTransferred, 'prefs must be transferred').toBe(true);
    expect(counts.recentlyViewed, 'recentlyViewed count must be ≥ 1').toBeGreaterThanOrEqual(1);
    expect(counts.sessionsRevoked, 'wallet A sessions must be revoked').toBeGreaterThanOrEqual(1);

    // Verify the on-chain-transfer notice is present in the response
    expect(execBody.migration.onChainTransferBlocked.reason).toContain(
      'on-chain profile',
    );
    expect(execBody.migration.onChainTransferBlocked.trackingIssue).toContain(
      'issues/1315',
    );

    // ----- Step 6: Wallet A's session is revoked -----
    // The session cookie may still be in the jar but server rejects it.
    expect(
      await apiStatus(page, '/api/auth/session'),
      'wallet A session must be revoked (401)',
    ).toBe(401);

    // UI also reflects sign-out (WalletContext reconciliation picks up the 401)
    await expect.poll(() => connectButton(page).isVisible(), {
      timeout: 70_000,
    }).toBe(true);

    // Verify wallet A's session cookie is gone or dead
    // (cookie may still physically exist, but the server now rejects it)
    const sessionCookie = await readCookie(context, 'session');
    if (sessionCookie) {
      // If cookie is still in the jar, the server-side session must be dead
      expect(await apiStatus(page, '/api/watchlist')).toBe(401);
    }

    // ----- Step 7: Wallet B now owns the migrated data -----
    const watchlistB = await apiRequest(pageB, '/api/watchlist');
    expect(watchlistB.status).toBe(200);
    const wlItems = watchlistB.body as Array<{ playerId: string }>;
    const playerIds = wlItems.map((e) => e.playerId);
    expect(playerIds, 'playerA must be in wallet B watchlist').toContain(playerA);
    expect(playerIds, 'playerB must be in wallet B watchlist').toContain(playerB);

    const savedSearchesB = await apiRequest(pageB, '/api/saved-searches');
    expect(savedSearchesB.status).toBe(200);
    const ssItems = savedSearchesB.body as Array<{ name: string }>;
    expect(
      ssItems.some((s) => s.name === 'Top strikers East Africa'),
      'saved search must be present under wallet B',
    ).toBe(true);

    const notifPrefsB = await apiRequest(pageB, '/api/notification-preferences');
    expect(notifPrefsB.status).toBe(200);
    const prefs = notifPrefsB.body as { milestoneApprovals: boolean; contactUnlocks: boolean };
    expect(prefs.milestoneApprovals, 'milestoneApprovals pref migrated').toBe(true);
    expect(prefs.contactUnlocks, 'contactUnlocks pref migrated').toBe(false);

    const recentlyViewedB = await apiRequest(pageB, '/api/recently-viewed');
    expect(recentlyViewedB.status).toBe(200);
    const rvItems = recentlyViewedB.body as Array<{ playerId: string }>;
    expect(
      rvItems.some((r) => r.playerId === playerA),
      'recently viewed entry must be present under wallet B',
    ).toBe(true);

    await contextB.close();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Cancel path
// ---------------------------------------------------------------------------
test.describe.serial('cancel path: request → cancel → nothing moved', () => {
  test('cancelling a migration during cooling-off prevents data from moving', async ({
    page,
    wallet: walletA,
  }) => {
    test.setTimeout(60_000);

    // Wallet A signs in and seeds one watchlist entry
    await connect(page, walletA.publicKey);
    const playerC = 'GBHWKBPP3O4H2BUUKSFXE4PK5WHLF522FAGLUSP4HPVGPNMKJQ2IGVON';
    await apiRequest(page, '/api/watchlist', 'POST', { playerId: playerC });

    // Wallet B signs in as the requester (toWallet)
    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    // Wallet B creates the migration request
    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status).toBe(201);
    const migRequest = reqRes.body as { id: string; status: string };

    // Wallet A (fromWallet) cancels the request during cooling-off
    const cancelRes = await apiRequest(page, '/api/migration/cancel', 'POST', {
      requestId: migRequest.id,
    });
    expect(cancelRes.status, 'cancel must return 200').toBe(200);
    const cancelled = cancelRes.body as { id: string; status: string; cancelledBy: string };
    expect(cancelled.status, 'status must be cancelled').toBe('cancelled');
    expect(cancelled.cancelledBy, 'cancelledBy must be wallet A').toBe(walletA.publicKey);

    // Attempting to execute a cancelled request must be rejected
    await advanceCoolingOff(pageB, migRequest.id);
    const execRes = await apiRequest(pageB, '/api/migration/execute', 'POST', {
      requestId: migRequest.id,
    });
    expect(execRes.status, 'executing a cancelled request must return 409').toBe(409);

    // Wallet A's data must still be intact
    const watchlistA = await apiRequest(page, '/api/watchlist');
    expect(watchlistA.status).toBe(200);
    const wlItems = watchlistA.body as Array<{ playerId: string }>;
    expect(
      wlItems.some((e) => e.playerId === playerC),
      'wallet A watchlist entry must still exist after cancel',
    ).toBe(true);

    // Wallet B must NOT have acquired wallet A's watchlist entry
    const watchlistB = await apiRequest(pageB, '/api/watchlist');
    expect(watchlistB.status).toBe(200);
    const wlBItems = watchlistB.body as Array<{ playerId: string }>;
    expect(
      wlBItems.some((e) => e.playerId === playerC),
      'wallet B must not have wallet A data after cancel',
    ).toBe(false);

    await contextB.close();
  });

  test('toWallet (wallet B) can also cancel a pending request', async ({
    page,
    wallet: walletA,
  }) => {
    test.setTimeout(60_000);

    await connect(page, walletA.publicKey);

    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    // Wallet B submits the request
    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status).toBe(201);
    const migRequest = reqRes.body as { id: string };

    // Wallet B cancels its own request
    const cancelRes = await apiRequest(pageB, '/api/migration/cancel', 'POST', {
      requestId: migRequest.id,
    });
    expect(cancelRes.status, 'toWallet cancel must return 200').toBe(200);
    const cancelled = cancelRes.body as { status: string; cancelledBy: string };
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledBy).toBe(walletB.publicKey);

    await contextB.close();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Negative cases
// ---------------------------------------------------------------------------
test.describe('negative cases: invalid requests are rejected', () => {
  test('executing without a valid request ID returns 404', async ({
    page,
    wallet: walletA,
  }) => {
    await connect(page, walletA.publicKey);

    const res = await apiRequest(page, '/api/migration/execute', 'POST', {
      requestId: 'non-existent-id-00000000-0000-0000-0000-000000000000',
    });
    expect(res.status, 'non-existent request must return 404').toBe(404);
  });

  test('submitting a request requires authentication (unauthenticated returns 401)', async ({
    page,
  }) => {
    // page has no active wallet session — visit home without connecting
    await page.goto('/en');

    // Verify we are not signed in
    await expect(connectButton(page)).toBeVisible();

    const res = await apiRequest(page, '/api/migration/request', 'POST', {
      fromWallet: 'GBEJGP2RWKAO7LGFHBPFHZV7LDUHXSEHQ4XQOPEK26YXRUEHSKGICQ3A',
    });
    expect(res.status, 'unauthenticated request must return 401').toBe(401);
  });

  test('executing a request as a non-party wallet is rejected with 403', async ({
    page,
    wallet: walletA,
  }) => {
    test.setTimeout(60_000);

    // Wallet A logs in
    await connect(page, walletA.publicKey);

    // Wallet B logs in a separate context and creates the migration request
    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status).toBe(201);
    const migRequest = reqRes.body as { id: string };
    await advanceCoolingOff(pageB, migRequest.id);

    // Wallet A (fromWallet) attempts to execute — only toWallet may execute
    const execAsA = await apiRequest(page, '/api/migration/execute', 'POST', {
      requestId: migRequest.id,
    });
    expect(execAsA.status, 'fromWallet executing must return 403').toBe(403);

    // Clean up: cancel the request so it doesn't interfere with other tests
    await apiRequest(pageB, '/api/migration/cancel', 'POST', {
      requestId: migRequest.id,
    });

    await contextB.close();
  });

  test('executing during cooling-off is rejected with 425 Too Early', async ({
    page,
    wallet: walletA,
  }) => {
    test.setTimeout(60_000);

    await connect(page, walletA.publicKey);

    // Wallet B creates the request but does NOT advance cooling-off
    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status).toBe(201);
    const migRequest = reqRes.body as { id: string };

    // Attempt execution immediately — cooling-off has not elapsed
    const execRes = await apiRequest(pageB, '/api/migration/execute', 'POST', {
      requestId: migRequest.id,
    });
    expect(execRes.status, 'premature execute must return 425 Too Early').toBe(425);
    const execBody = execRes.body as { executeAfter: number; remainingMs: number };
    expect(execBody.executeAfter, 'response must include executeAfter').toBeGreaterThan(Date.now());
    expect(execBody.remainingMs, 'response must include remainingMs').toBeGreaterThan(0);

    // Cancel to clean up
    await apiRequest(pageB, '/api/migration/cancel', 'POST', {
      requestId: migRequest.id,
    });

    await contextB.close();
  });

  test('fromWallet and toWallet must be different keys', async ({
    page,
    wallet: walletA,
  }) => {
    await connect(page, walletA.publicKey);

    // toWallet is walletA; fromWallet is also walletA — must be rejected
    const res = await apiRequest(page, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(res.status, 'same-wallet request must return 400').toBe(400);
  });

  test('fromWallet must be a valid Stellar public key', async ({
    page,
    wallet: walletA,
  }) => {
    await connect(page, walletA.publicKey);

    const res = await apiRequest(page, '/api/migration/request', 'POST', {
      fromWallet: 'not-a-stellar-key',
    });
    expect(res.status, 'invalid fromWallet must return 400').toBe(400);
  });

  test('GET /api/migration/request lists requests for the session wallet', async ({
    page,
    wallet: walletA,
  }) => {
    test.setTimeout(60_000);

    await connect(page, walletA.publicKey);

    // Wallet B creates a request targeting wallet A
    const contextB = await (page.context().browser()!).newContext();
    const pageB = await contextB.newPage();
    const walletB = await installMockFreighter(pageB, { secret: E2E_ALT_WALLET_SECRET });
    await connect(pageB, walletB.publicKey);

    const reqRes = await apiRequest(pageB, '/api/migration/request', 'POST', {
      fromWallet: walletA.publicKey,
    });
    expect(reqRes.status).toBe(201);
    const created = reqRes.body as { id: string };

    // Wallet A can see the request via GET (it is the fromWallet)
    const listResA = await apiRequest(page, '/api/migration/request');
    expect(listResA.status).toBe(200);
    const listA = listResA.body as { requests: Array<{ id: string }> };
    expect(
      listA.requests.some((r) => r.id === created.id),
      'wallet A must see the request in its list',
    ).toBe(true);

    // Wallet B can also see the request (it is the toWallet)
    const listResB = await apiRequest(pageB, '/api/migration/request');
    expect(listResB.status).toBe(200);
    const listB = listResB.body as { requests: Array<{ id: string }> };
    expect(
      listB.requests.some((r) => r.id === created.id),
      'wallet B must see the request in its list',
    ).toBe(true);

    // Cancel to clean up
    await apiRequest(page, '/api/migration/cancel', 'POST', {
      requestId: created.id,
    });

    await contextB.close();
  });
});
