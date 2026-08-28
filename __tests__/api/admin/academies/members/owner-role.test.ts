/** @jest-environment node */

// Route-level authorization tests for issue #1173 (scoped academy-owner
// admin role). Exercises the real app/api/admin/academies/[id]/members/**
// route handlers together with the real lib/academyAuth.ts resolution
// logic (not mocked) — only the backend HTTP client (@/lib/api) and the
// session cookie are stubbed, so this proves the four acceptance-criteria
// scenarios end-to-end at the route boundary, not just unit-by-unit.
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// lib/session.ts's real cookie verification depends on lib/sessionStore.ts's
// SQLite-backed session registry, which is orthogonal to what this suite is
// testing (route-level *role* authorization). Stub getSessionWallet to read
// the wallet straight off the (unsigned, test-only) cookie value instead —
// keeps the suite focused on lib/academyAuth.ts's real resolution logic.
jest.mock('@/lib/session', () => ({
  getSessionWallet: (req: import('next/server').NextRequest) =>
    req.cookies.get('session')?.value ?? null,
}));

import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { POST as addMember } from '@/app/api/admin/academies/[id]/members/route';
import { DELETE as removeMember } from '@/app/api/admin/academies/[id]/members/[wallet]/route';

const mockApi = api as jest.Mocked<typeof api>;

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const OWNER = 'GOWNER00000000000000000000000000000000000000000000000AA';
const OTHER_OWNER = 'GOWNER00000000000000000000000000000000000000000000000BB';
const STRANGER = 'GSTRANGER000000000000000000000000000000000000000000000';
const SIGNER = 'GSIGNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const ACADEMY_A_ID = 'academy-a';
const ACADEMY_B_ID = 'academy-b';

function requestWithCookie(
  wallet: string | null,
  init: { method?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (wallet) headers.cookie = `session=${wallet}`;
  return new NextRequest('http://localhost/api/admin/academies/x/members', {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

// Owner-lookup stub: OWNER owns academy A, OTHER_OWNER owns academy B,
// STRANGER owns nothing. ADMIN never needs this — resolveAcademyRole
// short-circuits on the super-admin match before calling it.
function mockOwnerLookup() {
  mockApi.get.mockImplementation((url: string) => {
    if (url === `/academies/owner/${OWNER}`) {
      return Promise.resolve({
        data: [{ id: ACADEMY_A_ID, name: 'FC A', ownerWallet: OWNER, members: [] }],
      });
    }
    if (url === `/academies/owner/${OTHER_OWNER}`) {
      return Promise.resolve({
        data: [{ id: ACADEMY_B_ID, name: 'FC B', ownerWallet: OTHER_OWNER, members: [] }],
      });
    }
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  mockOwnerLookup();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('academy-owner admin role — acceptance criteria', () => {
  it('allows an owner to add a member to their own academy', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { id: ACADEMY_A_ID, name: 'FC A', members: [{ wallet: SIGNER }] },
    });

    const res = await addMember(
      requestWithCookie(OWNER, { method: 'POST', body: { wallet: SIGNER } }),
      { params: { id: ACADEMY_A_ID } },
    );

    expect(res.status).toBe(201);
    expect(mockApi.post).toHaveBeenCalledWith(
      `/academies/${ACADEMY_A_ID}/members`,
      { wallet: SIGNER, addedBy: OWNER },
    );
  });

  it('denies an owner attempting to add a member to a different academy', async () => {
    const res = await addMember(
      requestWithCookie(OWNER, { method: 'POST', body: { wallet: SIGNER } }),
      { params: { id: ACADEMY_B_ID } },
    );

    expect(res.status).toBe(401);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('denies an owner attempting to remove a member from a different academy', async () => {
    const res = await removeMember(
      requestWithCookie(OWNER, { method: 'DELETE' }),
      { params: { id: ACADEMY_B_ID, wallet: SIGNER } },
    );

    expect(res.status).toBe(401);
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('allows the super-admin to manage any academy, including one it does not own', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { id: ACADEMY_B_ID, name: 'FC B', members: [{ wallet: SIGNER }] },
    });

    const res = await addMember(
      requestWithCookie(ADMIN, { method: 'POST', body: { wallet: SIGNER } }),
      { params: { id: ACADEMY_B_ID } },
    );

    expect(res.status).toBe(201);
    expect(mockApi.post).toHaveBeenCalledWith(
      `/academies/${ACADEMY_B_ID}/members`,
      { wallet: SIGNER, addedBy: ADMIN },
    );
  });

  it('denies a non-owner, non-admin wallet from managing any academy', async () => {
    const res = await addMember(
      requestWithCookie(STRANGER, { method: 'POST', body: { wallet: SIGNER } }),
      { params: { id: ACADEMY_A_ID } },
    );

    expect(res.status).toBe(401);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated caller (no session cookie)', async () => {
    const res = await addMember(
      requestWithCookie(null, { method: 'POST', body: { wallet: SIGNER } }),
      { params: { id: ACADEMY_A_ID } },
    );

    expect(res.status).toBe(401);
  });

  it('allows an owner to remove a member from their own academy', async () => {
    mockApi.delete.mockResolvedValueOnce({ data: { success: true } });

    const res = await removeMember(
      requestWithCookie(OWNER, { method: 'DELETE' }),
      { params: { id: ACADEMY_A_ID, wallet: SIGNER } },
    );

    expect(res.status).toBe(200);
    expect(mockApi.delete).toHaveBeenCalledWith(
      `/academies/${ACADEMY_A_ID}/members/${SIGNER}`,
    );
  });
});
