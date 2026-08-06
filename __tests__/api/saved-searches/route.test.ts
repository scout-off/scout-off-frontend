/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/saved-searches/route';
import { NextRequest } from 'next/server';
import { SavedSearchStore } from '@/lib/savedSearchStore';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) headers['cookie'] = `session=${init.cookie}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  SavedSearchStore.resetInstance();
});

afterEach(() => {
  SavedSearchStore.resetInstance();
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
