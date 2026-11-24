import type { Page } from '@playwright/test';
import { DEFAULT_PLAYER } from './mock-contract';

/**
 * Stubs the indexer as the browser sees it (the `/api/indexer/*` proxy, see
 * lib/indexerClient.ts): GET /players returns `players` as a single page,
 * filtered like the real endpoint (case-insensitive region/position, minLevel);
 * event and health endpoints return empty/healthy so pages don't error.
 */
export function mockIndexer(
  page: Page,
  players: Array<Record<string, unknown>> = [DEFAULT_PLAYER],
): void {
  void page.route('**/api/indexer/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/indexer/, '');
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (path === '/players') {
      const region = url.searchParams.get('region');
      const position = url.searchParams.get('position');
      const minLevel = Number(url.searchParams.get('minLevel') ?? 0);
      const matches = players.filter((p) => {
        const vitals = p.vitals as { region: string; position: string };
        const same = (a: string, b: string) =>
          a.toLowerCase() === b.toLowerCase();
        return (
          (!region || same(vitals.region, region)) &&
          (!position || same(vitals.position, position)) &&
          Number(p.progressLevel ?? 0) >= minLevel
        );
      });
      return json({
        players: matches,
        nextCursor: null,
        total: matches.length,
      });
    }
    if (path === '/health') {
      return json({
        status: 'ok',
        lastLedger: 1000,
        ledgerLag: 0,
        pollerRunning: true,
        uptime: 1,
      });
    }
    if (path.endsWith('/events') || path === '/events') {
      return json({ events: [], nextCursor: null });
    }
    if (path === '/stream') return route.abort();
    return json({});
  });
}
