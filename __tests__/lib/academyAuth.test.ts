/** @jest-environment node */

// See __tests__/app/api/admin/academies.test.ts for the pattern this
// mirrors: lib/api.ts creates its own axios instance at module load, so the
// mock's methods must exist before academyAuth is imported.
jest.mock('@/lib/session', () => ({
  getSessionWallet: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import api from '@/lib/api';
import { resolveAcademyRole, requireAcademyManager } from '@/lib/academyAuth';

const mockGetSessionWallet = getSessionWallet as jest.Mock;
const mockApiGet = api.get as jest.Mock;

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const OWNER = 'GOWNER0000000000000000000000000000000000000000000000000';
const STRANGER = 'GSTRANGER000000000000000000000000000000000000000000000';

const ACADEMY_A = { id: 'academy-a', name: 'FC A', ownerWallet: OWNER, members: [] };

function req() {
  return new NextRequest('http://localhost/api/admin/academies/academy-a/members');
}

describe('resolveAcademyRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  });

  it('returns null with no session', async () => {
    mockGetSessionWallet.mockReturnValue(null);
    expect(await resolveAcademyRole(req())).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('resolves the super-admin without hitting the owner-lookup backend', async () => {
    mockGetSessionWallet.mockReturnValue(ADMIN);
    const role = await resolveAcademyRole(req());
    expect(role).toEqual({ role: 'super-admin', wallet: ADMIN });
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('resolves an academy-owner when the wallet owns academies', async () => {
    mockGetSessionWallet.mockReturnValue(OWNER);
    mockApiGet.mockResolvedValue({ data: [ACADEMY_A] });
    const role = await resolveAcademyRole(req());
    expect(role).toEqual({
      role: 'academy-owner',
      wallet: OWNER,
      academyIds: ['academy-a'],
      academies: [ACADEMY_A],
    });
    expect(mockApiGet).toHaveBeenCalledWith(
      `/academies/owner/${OWNER}`,
    );
  });

  it('returns null for a wallet that owns nothing and is not the super-admin', async () => {
    mockGetSessionWallet.mockReturnValue(STRANGER);
    mockApiGet.mockResolvedValue({ data: [] });
    expect(await resolveAcademyRole(req())).toBeNull();
  });

  it('fails closed (returns null) when the backend lookup errors', async () => {
    mockGetSessionWallet.mockReturnValue(STRANGER);
    mockApiGet.mockRejectedValue(new Error('backend down'));
    expect(await resolveAcademyRole(req())).toBeNull();
  });
});

describe('requireAcademyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  });

  it('allows the super-admin to manage any academy id', async () => {
    mockGetSessionWallet.mockReturnValue(ADMIN);
    const role = await requireAcademyManager(req(), 'any-academy-id');
    expect(role?.role).toBe('super-admin');
  });

  it('allows an owner to manage their own academy', async () => {
    mockGetSessionWallet.mockReturnValue(OWNER);
    mockApiGet.mockResolvedValue({ data: [ACADEMY_A] });
    const role = await requireAcademyManager(req(), 'academy-a');
    expect(role?.role).toBe('academy-owner');
  });

  it('denies an owner attempting to manage a different academy', async () => {
    mockGetSessionWallet.mockReturnValue(OWNER);
    mockApiGet.mockResolvedValue({ data: [ACADEMY_A] });
    const role = await requireAcademyManager(req(), 'some-other-academy');
    expect(role).toBeNull();
  });

  it('denies a non-owner, non-admin wallet', async () => {
    mockGetSessionWallet.mockReturnValue(STRANGER);
    mockApiGet.mockResolvedValue({ data: [] });
    const role = await requireAcademyManager(req(), 'academy-a');
    expect(role).toBeNull();
  });
});
