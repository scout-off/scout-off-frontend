/** @jest-environment node */
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/lib/indexerClient', () => ({
  __esModule: true,
  fetchApprovalCountsByWallets: jest.fn(),
}));

import { GET } from '@/app/api/admin/academies/rollup/route';
import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { fetchApprovalCountsByWallets } from '@/lib/indexerClient';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

const mockApi = api as jest.Mocked<typeof api>;
const mockFetchCounts = fetchApprovalCountsByWallets as jest.Mock;

/**
 * Mints an access token AND registers its `sid` as an active session (what
 * a real login does) — a bare createSessionToken() with no store row is a
 * signed-but-never-issued-through-login token, which getSessionWallet
 * rejects (see #1179, __tests__/lib/session.test.ts's issueActiveAccessToken).
 */
function issueActiveAccessToken(publicKey: string): string {
  const sid = `sid-${Math.random().toString(36).slice(2)}`;
  const token = createSessionToken(publicKey, 'access', 20 * 60, { sid });
  SessionStore.getInstance().create(sid, publicKey, Date.now() + 60_000);
  return token;
}

function makeRequest(opts: { cookie?: string; qs?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.cookie !== undefined) {
    headers['cookie'] = `session=${issueActiveAccessToken(opts.cookie)}`;
  }
  return new NextRequest(
    `http://localhost/api/admin/academies/rollup${opts.qs ?? ''}`,
    { headers },
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  SessionStore.resetInstance();
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  SessionStore.resetInstance();
});

describe('GET /api/admin/academies/rollup', () => {
  it('returns 401 without an admin session', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-admin session', async () => {
    const res = await GET(makeRequest({ cookie: SCOUT }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid rangeDays value', async () => {
    const res = await GET(makeRequest({ cookie: ADMIN, qs: '?rangeDays=13' }));
    expect(res.status).toBe(400);
  });

  it('sums per-wallet approval counts into per-academy totals, excluding pre-membership approvals via since', async () => {
    (mockApi.get as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'acad-1',
          name: 'FC Sahel',
          ownerWallet: 'GOWNER1',
          createdAt: 1,
          members: [
            { wallet: 'GWALLET_A', academyId: 'acad-1', addedAt: 111, addedBy: ADMIN },
            { wallet: 'GWALLET_B', academyId: 'acad-1', addedAt: 222, addedBy: ADMIN },
          ],
        },
      ],
    });
    mockFetchCounts.mockResolvedValue({
      range: { start: 0, end: 1000 },
      counts: { GWALLET_A: 3, GWALLET_B: 5 },
    });

    const res = await GET(makeRequest({ cookie: ADMIN, qs: '?rangeDays=30' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.indexerAvailable).toBe(true);
    expect(body.academies).toEqual([
      {
        academyId: 'acad-1',
        academyName: 'FC Sahel',
        memberCount: 2,
        approvedMilestones: 8,
      },
    ]);

    // Each member wallet was passed with its own `since` (== addedAt), not
    // just the range start — this is what lets the indexer exclude
    // pre-membership approvals per wallet.
    const [, passedWallets] = mockFetchCounts.mock.calls[0];
    expect(passedWallets).toEqual(
      expect.arrayContaining([
        { wallet: 'GWALLET_A', since: 111 },
        { wallet: 'GWALLET_B', since: 222 },
      ]),
    );
  });

  it('reports indexerAvailable: false and null counts when the indexer call fails', async () => {
    (mockApi.get as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'acad-1',
          name: 'FC Sahel',
          ownerWallet: 'GOWNER1',
          createdAt: 1,
          members: [{ wallet: 'GWALLET_A', academyId: 'acad-1', addedAt: 1, addedBy: ADMIN }],
        },
      ],
    });
    mockFetchCounts.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await GET(makeRequest({ cookie: ADMIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.indexerAvailable).toBe(false);
    expect(body.academies[0].approvedMilestones).toBeNull();
  });

  it('does not call the indexer when no academy has any members', async () => {
    (mockApi.get as jest.Mock).mockResolvedValue({ data: [] });

    const res = await GET(makeRequest({ cookie: ADMIN }));
    expect(res.status).toBe(200);
    expect(mockFetchCounts).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.academies).toEqual([]);
  });
});
