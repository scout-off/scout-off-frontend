/** @jest-environment node */
import { GET, POST, PATCH, DELETE } from '@/app/api/saved-searches/route';
import { NextRequest } from 'next/server';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

let sidCounter = 0;

// getSessionWallet checks lib/sessionStore.ts in addition to the token's
// signature (see #1179) — a cookie with no matching, active store row is
// treated as unauthenticated, same as an unsigned one. Register the sid
// alongside the token so it mirrors what a real SEP-10 login produces.
function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) {
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
  SavedSearchStore.resetInstance();
  SessionStore.resetInstance();
});

afterEach(() => {
  SavedSearchStore.resetInstance();
  SessionStore.resetInstance();
});

describe('GET /api/saved-searches', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(makeRequest('http://localhost/api/saved-searches'));
    expect(res.status).toBe(401);
  });

  it('lists searches scoped to the requesting scout', async () => {
    SavedSearchStore.getInstance().add(SCOUT, 'Mine', { region: 'Europe' });
    SavedSearchStore.getInstance().add('GOTHER', 'Theirs', {
      region: 'Africa',
    });

    const res = await GET(
      makeRequest('http://localhost/api/saved-searches', { cookie: SCOUT }),
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Mine');
  });
});

describe('POST /api/saved-searches', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        body: { name: 'x', filter: {} },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing name', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        cookie: SCOUT,
        body: { filter: {} },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing filter', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        cookie: SCOUT,
        body: { name: 'My search' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('saves a search and returns it with 201', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        cookie: SCOUT,
        body: { name: 'My search', filter: { region: 'Europe' } },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      scoutWallet: SCOUT,
      name: 'My search',
      filter: { region: 'Europe' },
    });
  });
});

describe('DELETE /api/saved-searches', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await DELETE(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'DELETE',
        body: { id: 1 },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent entry', async () => {
    const res = await DELETE(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: 999 },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('removes a search owned by the requesting scout', async () => {
    const entry = SavedSearchStore.getInstance().add(SCOUT, 'Mine', {});

    const res = await DELETE(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: entry.id },
      }),
    );
    expect(res.status).toBe(200);
    expect(SavedSearchStore.getInstance().list(SCOUT)).toEqual([]);
  });

  it('does not remove a search owned by a different scout', async () => {
    const entry = SavedSearchStore.getInstance().add('GOTHER', 'Theirs', {});

    const res = await DELETE(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'DELETE',
        cookie: SCOUT,
        body: { id: entry.id },
      }),
    );
    expect(res.status).toBe(404);
    expect(SavedSearchStore.getInstance().list('GOTHER')).toHaveLength(1);
  });
});

// issue #1143 — server-side inputValidation parity
describe('POST /api/saved-searches — name length validation (issue #1143)', () => {
  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        cookie: SCOUT,
        body: { name: 'a'.repeat(101), filter: {} },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('accepts a name at exactly 100 characters', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'POST',
        cookie: SCOUT,
        body: { name: 'a'.repeat(100), filter: { region: 'Europe' } },
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/saved-searches — name length validation (issue #1143)', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        body: { id: 1, name: 'renamed' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing id', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { name: 'renamed' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const entry = SavedSearchStore.getInstance().add(SCOUT, 'Original', {});
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: entry.id, name: 'a'.repeat(101) },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('accepts a name at exactly 100 characters and renames the entry', async () => {
    const entry = SavedSearchStore.getInstance().add(SCOUT, 'Original', {});
    const newName = 'a'.repeat(100);
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: entry.id, name: newName },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(newName);
  });

  it('returns 404 for a non-existent saved search', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: 999, name: 'renamed' },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/saved-searches — markViewed', () => {
  it('returns 400 when neither name nor markViewed is provided', async () => {
    const entry = SavedSearchStore.getInstance().add(SCOUT, 'Original', {});
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: entry.id },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('updates lastViewedAt and returns the entry', async () => {
    const entry = SavedSearchStore.getInstance().add(SCOUT, 'Original', {});
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: entry.id, markViewed: true },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastViewedAt).toBeGreaterThanOrEqual(entry.createdAt);
  });

  it('returns 404 when marking a non-existent saved search viewed', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: 999, markViewed: true },
      }),
    );
    expect(res.status).toBe(404);
  });

  it('does not mark viewed a saved search owned by a different scout', async () => {
    const entry = SavedSearchStore.getInstance().add('GOTHER', 'Theirs', {});
    const res = await PATCH(
      makeRequest('http://localhost/api/saved-searches', {
        method: 'PATCH',
        cookie: SCOUT,
        body: { id: entry.id, markViewed: true },
      }),
    );
    expect(res.status).toBe(404);
  });
});
