/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/watchlist/route';
import { NextRequest } from 'next/server';
import { WatchlistStore } from '@/lib/watchlistStore';
import { createSessionToken } from '@/lib/session';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined)
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60)}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  WatchlistStore.resetInstance();
});

afterEach(() => {
  WatchlistStore.resetInstance();
});

describe('GET /api/watchlist', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(makeRequest('http://localhost/api/watchlist'));
    expect(res.status).toBe(401);
  });

  it('returns an empty list when nothing is watchlisted', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/watchlist', { cookie: SCOUT }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists entries scoped to the requesting scout', async () => {
    WatchlistStore.getInstance().add(SCOUT, 'player-1');
    WatchlistStore.getInstance().add('GOTHER', 'player-2');

    const res = await GET(
      makeRequest('http://localhost/api/watchlist', { cookie: SCOUT }),
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].playerId).toBe('player-1');
  });
});

describe('POST /api/watchlist', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        body: { playerId: 'player-1' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing playerId', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: {},
      }),
    );
    expect(res.status).toBe(400);
  });

  it('adds a player and returns it with 201', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: 'player-1' },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ scoutWallet: SCOUT, playerId: 'player-1' });
  });
});

describe('DELETE /api/watchlist', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await DELETE(
      makeRequest('http://localhost/api/watchlist', {
        method: 'DELETE',
        body: { id: 1 },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await DELETE(
      makeRequest('http://localhost/api/watchlist', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: 'not-a-number' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent entry', async () => {
    const res = await DELETE(
      makeRequest('http://localhost/api/watchlist', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: 999 },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('removes an entry owned by the requesting scout', async () => {
    const entry = WatchlistStore.getInstance().add(SCOUT, 'player-1');

    const res = await DELETE(
      makeRequest('http://localhost/api/watchlist', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: entry.id },
      }),
    );
    expect(res.status).toBe(200);
    expect(WatchlistStore.getInstance().list(SCOUT)).toEqual([]);
  });

  it('does not remove an entry owned by a different scout', async () => {
    const entry = WatchlistStore.getInstance().add('GOTHER', 'player-1');

    const res = await DELETE(
      makeRequest('http://localhost/api/watchlist', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: entry.id },
      }),
    );
    expect(res.status).toBe(404);
    expect(WatchlistStore.getInstance().list('GOTHER')).toHaveLength(1);
  });
});

describe('POST /api/watchlist address validation and normalization', () => {
  it('returns 400 for an invalid playerId (not a valid Stellar address)', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: 'invalid-address' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a playerId that is too short', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: 'GA' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('normalizes lowercase playerId to uppercase before storage', async () => {
    const lowerCasePlayerId = 'gabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567';
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: lowerCasePlayerId },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // Verify it's stored as uppercase
    expect(body.playerId).toBe(lowerCasePlayerId.toUpperCase());
  });

  it('normalizes mixed-case playerId to uppercase before storage', async () => {
    const mixedCasePlayerId = 'GaBc123DeF456GhI789JkL012MnO345PqR678StU901VwX234Yz567';
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: mixedCasePlayerId },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // Verify it's stored as uppercase
    expect(body.playerId).toBe(mixedCasePlayerId.toUpperCase());
  });

  it('treats same address with different casing as duplicate', async () => {
    const addrUpper = 'GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ567';
    const addrLower = 'gabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567';

    // Add with uppercase
    await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: addrUpper },
      }),
    );

    // Add same address in lowercase - should be treated as duplicate
    const res2 = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        cookie: SCOUT,
        body: { playerId: addrLower },
      }),
    );

    // Should still return 201 (INSERT OR IGNORE), but the list should have only 1 entry
    expect(res2.status).toBe(201);

    const listRes = await GET(
      makeRequest('http://localhost/api/watchlist', { cookie: SCOUT }),
    );
    const entries = await listRes.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].playerId).toBe(addrUpper);
  });
});
