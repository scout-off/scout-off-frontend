/** @jest-environment node */
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { GET, POST } from '@/app/api/admin/academies/route';
import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { createSessionToken } from '@/lib/session';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

const mockApi = api as jest.Mocked<typeof api>;

function makeRequest(
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined)
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60)}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest('http://localhost/api/admin/academies', {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/admin/academies', () => {
  it('returns 401 without an admin session cookie', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-admin session', async () => {
    const res = await GET(makeRequest({ cookie: SCOUT }));
    expect(res.status).toBe(401);
  });

  it('proxies the list from the backend for admins', async () => {
    (mockApi.get as jest.Mock).mockResolvedValue({
      data: [{ id: 1, name: 'Test Academy' }],
    });
    const res = await GET(makeRequest({ cookie: ADMIN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 1, name: 'Test Academy' }]);
  });
});

describe('POST /api/admin/academies', () => {
  it('returns 401 without an admin session', async () => {
    const res = await POST(makeRequest({ method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing name', async () => {
    const res = await POST(
      makeRequest({
        method: 'POST',
        cookie: ADMIN,
        body: {
          ownerWallet:
            'GSOMEWALLET000000000000000000000000000000000000000000000',
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing ownerWallet', async () => {
    const res = await POST(
      makeRequest({
        method: 'POST',
        cookie: ADMIN,
        body: { name: 'Test Academy' },
      }),
    );
    expect(res.status).toBe(400);
  });

  // issue #1143 — server-side validation parity
  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await POST(
      makeRequest({
        method: 'POST',
        cookie: ADMIN,
        body: {
          name: 'a'.repeat(101),
          ownerWallet:
            'GSOMEWALLET000000000000000000000000000000000000000000000',
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('accepts a name at exactly 100 characters', async () => {
    (mockApi.post as jest.Mock).mockResolvedValue({
      data: { id: 1, name: 'a'.repeat(100) },
    });
    const res = await POST(
      makeRequest({
        method: 'POST',
        cookie: ADMIN,
        body: {
          name: 'a'.repeat(100),
          ownerWallet:
            'GSOMEWALLET000000000000000000000000000000000000000000000',
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it('creates an academy and returns 201 with valid inputs', async () => {
    const created = { id: 1, name: 'Scout Academy', ownerWallet: ADMIN };
    (mockApi.post as jest.Mock).mockResolvedValue({ data: created });

    const res = await POST(
      makeRequest({
        method: 'POST',
        cookie: ADMIN,
        body: { name: 'Scout Academy', ownerWallet: ADMIN },
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });
});
