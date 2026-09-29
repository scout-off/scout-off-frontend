/** @jest-environment node */
import { GET, POST } from '@/app/api/admin/automated-moderation-log/route';
import { NextRequest } from 'next/server';
import { AdminAuditStore } from '@/lib/adminAuditStore';

const BASE = 'http://localhost/api/admin/automated-moderation-log';

function get(query: string): NextRequest {
  return new NextRequest(`${BASE}${query}`);
}

async function record(n: number, userId: string): Promise<void> {
  const res = await POST(
    new NextRequest(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `mod-${n}`,
        category: 'spam',
        rule: 'link-flood',
        severity: 'low',
        userId,
        threadId: `thread-${n}`,
        timestamp: 1_700_000_000 + n,
      }),
    }),
  );
  expect(res.status).toBe(201);
}

beforeEach(() => {
  AdminAuditStore.resetInstance();
  AdminAuditStore.getInstance(':memory:');
});

afterAll(() => {
  AdminAuditStore.resetInstance();
});

describe('GET /api/admin/automated-moderation-log', () => {
  it('returns every entry for a user whose entries are older than the latest 50', async () => {
    // 120 entries across 3 users: user-a's 40 are the oldest, so none of
    // them are in the latest 50 overall.
    for (let i = 0; i < 40; i++) await record(i, 'user-a');
    for (let i = 40; i < 120; i++) {
      await record(i, i % 2 === 0 ? 'user-b' : 'user-c');
    }

    const seen: string[] = [];
    let cursor: number | null = null;
    let pages = 0;
    do {
      const query: string =
        `?userId=user-a&limit=15` +
        (cursor !== null ? `&before=${cursor}` : '');
      const res = await GET(get(query));
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const entry of body.entries) {
        expect(entry.data.userId).toBe('user-a');
        seen.push(entry.txHash);
      }
      cursor = body.nextCursor;
      pages++;
    } while (cursor !== null && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(40);
  });

  it('defaults to 50 entries and returns a nextCursor', async () => {
    for (let i = 0; i < 55; i++) await record(i, 'user-a');

    const body = await (await GET(get(''))).json();

    expect(body.entries).toHaveLength(50);
    expect(typeof body.nextCursor).toBe('number');
  });

  it.each([
    ['limit=0'],
    ['limit=201'],
    ['limit=abc'],
    ['limit=1.5'],
    ['from=abc'],
    ['to=nope'],
    ['before=xyz'],
  ])('returns 400 for invalid query param %s', async (query) => {
    const res = await GET(get(`?${query}`));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual(expect.any(String));
  });
});
