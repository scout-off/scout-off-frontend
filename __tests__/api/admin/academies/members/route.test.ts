/** @jest-environment node */
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

import { POST } from '@/app/api/admin/academies/[id]/members/route';
import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { createSessionToken } from '@/lib/session';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';
// A valid Stellar public key: 'G' + 55 uppercase base32 chars
const VALID_WALLET = 'GBVZP6CRCFMIQVXZLUVBZXGTM3ZJDZ55ZRR62UYAF4ODAHKJHTHAAAA';

const mockApi = api as jest.Mocked<typeof api>;

function makeRequest(
  academyId: string,
  init: { cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined)
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60)}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(
    `http://localhost/api/admin/academies/${academyId}/members`,
    {
      method: 'POST',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('POST /api/admin/academies/:id/members', () => {
  it('returns 401 without an admin session', async () => {
    const res = await POST(makeRequest('1'), { params: { id: '1' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-admin session', async () => {
    const res = await POST(
      makeRequest('1', { cookie: SCOUT, body: { wallet: VALID_WALLET } }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when wallet is missing', async () => {
    const res = await POST(makeRequest('1', { cookie: ADMIN, body: {} }), {
      params: { id: '1' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/wallet/i);
  });

  it('returns 400 when wallet is an empty string', async () => {
    const res = await POST(
      makeRequest('1', { cookie: ADMIN, body: { wallet: '   ' } }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
  });

  // issue #1143 — server-side validation parity: Stellar public key format
  it('returns 400 when wallet is not a valid Stellar public key (wrong prefix)', async () => {
    const res = await POST(
      makeRequest('1', {
        cookie: ADMIN,
        body: {
          wallet: 'XBVZP6CRCFMIQVXZLUVBZXGTM3ZJDZ55ZRR62UYAF4ODAHKJHTHAAAA',
        },
      }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stellar public key/i);
  });

  it('returns 400 when wallet is too short', async () => {
    const res = await POST(
      makeRequest('1', {
        cookie: ADMIN,
        body: { wallet: 'GSHORT' },
      }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stellar public key/i);
  });

  it('returns 400 when wallet contains invalid base32 characters', async () => {
    // '1' is not a valid base32 character in Stellar's alphabet
    const res = await POST(
      makeRequest('1', {
        cookie: ADMIN,
        body: {
          wallet: 'G1VZP6CRCFMIQVXZLUVBZXGTM3ZJDZ55ZRR62UYAF4ODAHKJHTHAAAA',
        },
      }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stellar public key/i);
  });

  it('adds the member and returns 201 for a valid Stellar public key', async () => {
    (mockApi.post as jest.Mock).mockResolvedValue({
      data: { id: 1, wallet: VALID_WALLET },
    });
    const res = await POST(
      makeRequest('1', { cookie: ADMIN, body: { wallet: VALID_WALLET } }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ wallet: VALID_WALLET });
  });
});
