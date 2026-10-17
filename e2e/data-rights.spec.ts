/**
 * Data-subject rights E2E (issue #1506).
 *
 * Seeds off-chain data for a freshly generated wallet through the real API
 * routes, then drives the settings page:
 *
 *   GET  /api/data-export            ("Download My Data")
 *   POST /api/data-deletion/request  (DataDeletionModal)
 *
 * Each scenario uses its own browser contexts and throwaway wallets so the
 * deletion test cannot affect any other spec, and so the data it creates is
 * removed by the test itself (the deletion scenario) or by the final cleanup
 * call (the export scenario).
 */
import { Keypair } from '@stellar/stellar-sdk';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { installMockFreighter } from './fixtures/wallet-mock';

interface Actor {
  context: BrowserContext;
  page: Page;
  publicKey: string;
}

function connectedButton(page: Page, publicKey: string) {
  return page.getByRole('button', {
    name: `Disconnect Wallet — ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`,
    exact: true,
  });
}

/** Opens a fresh context with a throwaway wallet and signs in via SEP-10. */
async function signIn(browser: Browser): Promise<Actor> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const wallet = await installMockFreighter(page, {
    secret: Keypair.random().secret(),
  });
  await page.goto('/en');
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await page.getByRole('button', { name: /freighter/i }).click();
  await expect(connectedButton(page, wallet.publicKey)).toBeVisible();
  return { context, page, publicKey: wallet.publicKey };
}

async function apiCall(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    },
    { path, method, body },
  );
}

interface Seeded {
  watchlistPlayer: string;
  searchName: string;
  recentPlayer: string;
}

async function seed(actor: Actor, label: string): Promise<Seeded> {
  const seeded: Seeded = {
    watchlistPlayer: Keypair.random().publicKey(),
    searchName: `${label}-search-${Date.now()}`,
    recentPlayer: Keypair.random().publicKey(),
  };
  const { page } = actor;
  expect(
    (await apiCall(page, '/api/watchlist', 'POST', {
      playerId: seeded.watchlistPlayer,
    })).status,
  ).toBeLessThan(300);
  expect(
    (await apiCall(page, '/api/saved-searches', 'POST', {
      name: seeded.searchName,
      filter: {},
    })).status,
  ).toBeLessThan(300);
  expect(
    (await apiCall(page, '/api/notification-preferences', 'PUT', {
      milestoneApprovals: false,
      contactUnlocks: true,
    })).status,
  ).toBeLessThan(300);
  expect(
    (await apiCall(page, '/api/recently-viewed', 'POST', {
      playerId: seeded.recentPlayer,
      viewedAt: Date.now(),
    })).status,
  ).toBeLessThan(300);
  return seeded;
}

interface ExportShape {
  schemaVersion: number;
  wallet: string;
  exportedAt: string;
  sections: {
    watchlist: { playerId: string }[];
    savedSearches: { name: string }[];
    notificationPreferences: {
      milestoneApprovals: boolean;
      contactUnlocks: boolean;
    };
    recentlyViewed: { playerId: string }[];
    backend?: unknown;
  };
  onChainExcluded: { explanation: string; explorerUrl: string };
}

test.describe('personal data export', () => {
  test('downloads a valid, isolated export without secrets', async ({
    browser,
  }) => {
    const owner = await signIn(browser);
    const other = await signIn(browser);
    try {
      const mine = await seed(owner, 'owner');
      const theirs = await seed(other, 'other');

      await owner.page.goto('/en/settings');
      const [download] = await Promise.all([
        owner.page.waitForEvent('download'),
        owner.page.getByRole('button', { name: 'Download My Data' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(
        /^scoutoff-data-export-.*\.json$/,
      );
      const path = await download.path();
      expect(path).toBeTruthy();
      const fs = await import('fs');
      const raw = fs.readFileSync(path as string, 'utf8');
      const data = JSON.parse(raw) as ExportShape;

      // Shape documented in lib/dataExport.ts / lib/offChainDataCollection.ts.
      expect(typeof data.schemaVersion).toBe('number');
      expect(data.wallet).toBe(owner.publicKey);
      expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
      expect(data.onChainExcluded.explanation).toMatch(/blockchain/i);
      expect(data.onChainExcluded.explorerUrl).toContain(owner.publicKey);

      // Seeded data is present.
      expect(data.sections.watchlist.map((w) => w.playerId)).toContain(
        mine.watchlistPlayer,
      );
      expect(data.sections.savedSearches.map((s) => s.name)).toContain(
        mine.searchName,
      );
      expect(data.sections.notificationPreferences).toEqual({
        milestoneApprovals: false,
        contactUnlocks: true,
      });
      expect(data.sections.recentlyViewed.map((r) => r.playerId)).toContain(
        mine.recentPlayer,
      );

      // Cross-user isolation.
      expect(raw).not.toContain(other.publicKey);
      expect(raw).not.toContain(theirs.watchlistPlayer);
      expect(raw).not.toContain(theirs.searchName);
      expect(raw).not.toContain(theirs.recentPlayer);

      // No auth secrets: neither cookie value may appear in the file.
      const cookies = await owner.context.cookies();
      for (const name of ['session', 'session_refresh']) {
        const value = cookies.find((c) => c.name === name)?.value;
        if (value) expect(raw).not.toContain(value);
      }
      expect(raw).not.toMatch(/refresh[_-]?token/i);
    } finally {
      // Cleanup: remove both throwaway wallets' data.
      await apiCall(owner.page, '/api/data-deletion/request', 'POST').catch(
        () => undefined,
      );
      await apiCall(other.page, '/api/data-deletion/request', 'POST').catch(
        () => undefined,
      );
      await owner.context.close();
      await other.context.close();
    }
  });

  test('rejects an unauthenticated export request', async ({ request }) => {
    const res = await request.get('/api/data-export');
    expect(res.status()).toBe(401);
  });
});

test.describe('personal data deletion', () => {
  test('requires confirmation, then removes the wallet data', async ({
    browser,
  }) => {
    const actor = await signIn(browser);
    const bystander = await signIn(browser);
    try {
      await seed(actor, 'victim');
      const bystanderData = await seed(bystander, 'bystander');

      await actor.page.goto('/en/settings');
      await actor.page
        .getByRole('button', { name: 'Request Deletion', exact: true })
        .click();
      const dialog = actor.page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // On-chain data is explained as not deletable.
      await expect(dialog.getByText('On-Chain Data (Cannot Be Deleted)')).toBeVisible();
      await expect(
        dialog.getByText(/No one .* can modify or delete this data/),
      ).toBeVisible();

      // Cancel does nothing: the data is still there.
      await dialog
        .getByRole('button', { name: 'Request Data Deletion' })
        .click();
      await expect(dialog.getByText('Are you sure?')).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog.getByText('Are you sure?')).toBeHidden();
      const stillThere = await apiCall(actor.page, '/api/watchlist');
      expect(JSON.stringify(stillThere.json)).toContain('playerId');

      // Confirm: the explicit second step performs the deletion.
      await dialog
        .getByRole('button', { name: 'Request Data Deletion' })
        .click();
      await dialog
        .getByRole('button', { name: 'Yes, Request Deletion' })
        .click();
      await expect(dialog.getByText('Request Submitted')).toBeVisible();

      // Every store now reads empty for the wallet (or the session is gone).
      for (const route of [
        '/api/watchlist',
        '/api/saved-searches',
        '/api/recently-viewed',
      ]) {
        const res = await apiCall(actor.page, route);
        if (res.status === 200) {
          const body = JSON.stringify(res.json);
          expect(body, `${route} must be empty after deletion`).not.toContain(
            'playerId":"G',
          );
          expect(body).not.toContain('"name":"victim-search');
        } else {
          expect(res.status).toBe(401);
        }
      }

      // Session is ended server-side: an export is no longer served with data.
      const exportAfter = await apiCall(actor.page, '/api/data-export');
      if (exportAfter.status === 200) {
        const sections = (exportAfter.json as ExportShape).sections;
        expect(sections.watchlist).toHaveLength(0);
        expect(sections.savedSearches).toHaveLength(0);
        expect(sections.recentlyViewed).toHaveLength(0);
      } else {
        expect(exportAfter.status).toBe(401);
      }

      // Other wallets are untouched.
      const other = await apiCall(bystander.page, '/api/watchlist');
      expect(JSON.stringify(other.json)).toContain(
        bystanderData.watchlistPlayer,
      );
    } finally {
      await apiCall(bystander.page, '/api/data-deletion/request', 'POST').catch(
        () => undefined,
      );
      await actor.context.close();
      await bystander.context.close();
    }
  });

  test('rejects an unauthenticated deletion request', async ({ request }) => {
    const res = await request.post('/api/data-deletion/request');
    expect(res.status()).toBe(401);
  });
});
