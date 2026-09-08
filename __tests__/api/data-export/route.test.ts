/** @jest-environment node */
import { GET } from '@/app/api/data-export/route';
import { NextRequest } from 'next/server';
import { WatchlistStore } from '@/lib/watchlistStore';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';
import { __resetForTests } from '@/lib/chunkedUploadStore';

const WALLET = 'GEXPORT0000000000000000000000000000000000000000000000000000000';
const OTHER = 'GOTHER000000000000000000000000000000000000000000000000000000000';

let sidCounter = 0;

function makeRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    // #1179: getSessionWallet also requires an active SessionStore row.
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(sid, cookie, Date.now() + 60 * 60 * 1000);
    headers['cookie'] =
      `session=${createSessionToken(cookie, 'access', 20 * 60, { sid })}`;
  }
  return new NextRequest('http://localhost/api/data-export', {
    method: 'GET',
    headers,
  });
}

beforeEach(() => {
  WatchlistStore.resetInstance();
  NotificationReadStore.resetInstance();
  SessionStore.resetInstance();
  __resetForTests();
});

afterEach(() => {
  WatchlistStore.resetInstance();
  NotificationReadStore.resetInstance();
  SessionStore.resetInstance();
  __resetForTests();
});

describe('GET /api/data-export', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns an authenticated, attachment-delivered export scoped to the wallet', async () => {
    WatchlistStore.getInstance().add(WALLET, 'PLAYER-1');
    WatchlistStore.getInstance().add(OTHER, 'PLAYER-OTHER');
    NotificationReadStore.getInstance().markRead(WALLET, [7]);

    const res = await GET(makeRequest(WALLET));
    expect(res.status).toBe(200);

    expect(res.headers.get('content-disposition')).toMatch(/attachment/);
    expect(res.headers.get('content-disposition')).toMatch(/filename=/);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const body = await res.json();
    expect(body.wallet).toBe(WALLET);
    expect(
      body.sections.watchlist.map((e: { playerId: string }) => e.playerId),
    ).toEqual(['PLAYER-1']);
    expect(body.sections.notificationReadIds).toEqual([7]);
    expect(body.onChainExcluded.explorerUrl).toContain(WALLET);
  });
});
