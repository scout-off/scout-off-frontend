/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/watchlist/route';
import { NextRequest } from 'next/server';
import { WatchlistStore } from '@/lib/watchlistStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

// Real, checksum-valid Ed25519 public keys — the watchlist route gates
// playerIds on isValidStellarAddress(), so fixtures must be genuine keys.
const PLAYER_A = 'GDGXH65ASAZNBPSWMQWO6R4HHT3KQ7VY3DPAQBE2DQGJVSBZL4VAC4AK';
const PLAYER_B = 'GCCGFUW47T7YAJ74QCG2USO2DUCSLWHFRUYBEVQBQWSOXMD3YUBRERLZ';

let sidCounter = 0;

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) {
    // getSessionWallet also requires an active SessionStore row for the
    // token's `sid` (see #1179), not just a valid signature.
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(
      sid,
      init.cookie,
      Date.now() + 60 * 60 * 1000,
    );
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60, { sid })}`;
  }
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  WatchlistStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  WatchlistStore.resetInstance();
  SessionStore.resetInstance();
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
    WatchlistStore.getInstance().add(SCOUT, PLAYER_A);
    WatchlistStore.getInstance().add('GOTHER', PLAYER_B);

    const res = await GET(
      makeRequest('http://localhost/api/watchlist', { cookie: SCOUT }),
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].playerId).toBe(PLAYER_A);
  });
});

describe('POST /api/watchlist', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/watchlist', {
        method: 'POST',
        body: { playerId: PLAYER_A },
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
        body: { playerId: PLAYER_A },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ scoutWallet: SCOUT, playerId: PLAYER_A });
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
    const entry = WatchlistStore.getInstance().add(SCOUT, PLAYER_A);

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
    const entry = WatchlistStore.getInstance().add('GOTHER', PLAYER_A);

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
    const lowerCasePlayerId = PLAYER_A.toLowerCase();
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
    expect(body.playerId).toBe(PLAYER_A);
  });

  it('normalizes mixed-case playerId to uppercase before storage', async () => {
    const mixedCasePlayerId =
      PLAYER_A.slice(0, 20).toLowerCase() + PLAYER_A.slice(20);
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
    expect(body.playerId).toBe(PLAYER_A);
  });

  it('treats same address with different casing as duplicate', async () => {
    const addrUpper = PLAYER_A;
    const addrLower = PLAYER_A.toLowerCase();

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
