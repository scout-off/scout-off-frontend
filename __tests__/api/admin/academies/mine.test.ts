/** @jest-environment node */
jest.mock('@/lib/academyAuth', () => ({
  resolveAcademyRole: jest.fn(),
}));

import { GET } from '@/app/api/admin/academies/mine/route';
import { NextRequest } from 'next/server';
import { resolveAcademyRole } from '@/lib/academyAuth';

const mockResolveAcademyRole = resolveAcademyRole as jest.Mock;

const OWNER = 'GOWNER00000000000000000000000000000000000000000000000000';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/academies/mine');
}

beforeEach(() => {
  mockResolveAcademyRole.mockReset();
});

describe('GET /api/admin/academies/mine', () => {
  it('returns 401 when there is no or an invalid session', async () => {
    mockResolveAcademyRole.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns [] for a super-admin', async () => {
    mockResolveAcademyRole.mockResolvedValue({
      role: 'super-admin',
      wallet: 'GADMIN',
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns exactly the academies an owner manages', async () => {
    const academies = [
      { id: 'a1', name: 'Academy One', ownerWallet: OWNER },
      { id: 'a2', name: 'Academy Two', ownerWallet: OWNER },
    ];
    mockResolveAcademyRole.mockResolvedValue({
      role: 'academy-owner',
      wallet: OWNER,
      academyIds: ['a1', 'a2'],
      academies,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(academies);
  });

  it('propagates a resolveAcademyRole failure (no local error handling)', async () => {
    // Current behaviour: the route does not catch, so Next.js turns the
    // rejection into its default 500 response.
    mockResolveAcademyRole.mockRejectedValue(new Error('boom'));
    await expect(GET(makeRequest())).rejects.toThrow('boom');
  });
});
