/** @jest-environment node */
jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
  checkIsValidator: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  fetchAcademyForWallet: jest.fn(),
}));

import { GET, POST } from '@/app/api/milestones/[playerId]/[milestoneId]/endorsements/route';
import { NextRequest } from 'next/server';
import { getPlayer, checkIsValidator } from '@/lib/contract';
import { fetchAcademyForWallet } from '@/lib/api';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';
import { MilestoneEndorsementStore } from '@/lib/milestoneEndorsementStore';
import type { Academy } from '@/types';

const mockGetPlayer = getPlayer as jest.Mock;
const mockCheckIsValidator = checkIsValidator as jest.Mock;
const mockFetchAcademyForWallet = fetchAcademyForWallet as jest.Mock;

const WALLET = 'GENDORSER0000000000000000000000000000000000000000000000';
const APPROVER = 'GAPPROVER000000000000000000000000000000000000000000000';

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 'academy-1',
    name: 'FC Sahel',
    ownerWallet: APPROVER,
    createdAt: 1,
    members: [{ wallet: APPROVER, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' }, { wallet: WALLET, academyId: 'academy-1', addedAt: 1, addedBy: 'GADMIN' }],
    quorum: 2,
    ...overrides,
  };
}

function makeGetRequest(): NextRequest {
  return new NextRequest(
    'http://localhost/api/milestones/player-1/milestone-1/endorsements',
  );
}

function makePostRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers['cookie'] = cookie;
  return new NextRequest(
    'http://localhost/api/milestones/player-1/milestone-1/endorsements',
    { method: 'POST', headers },
  );
}

function authedCookie(): string {
  const sid = `sid-${Math.random()}`;
  SessionStore.getInstance().create(sid, WALLET, Date.now() + 60_000);
  const token = createSessionToken(WALLET, 'access', 20 * 60, { sid });
  return `session=${token}`;
}

const params = { params: { playerId: 'player-1', milestoneId: 'milestone-1' } };

beforeEach(() => {
  jest.clearAllMocks();
  MilestoneEndorsementStore.resetInstance();
  SessionStore.resetInstance();
  mockCheckIsValidator.mockResolvedValue(true);
  mockGetPlayer.mockResolvedValue({
    milestones: [
      { id: 'milestone-1', description: 'x', evidenceHash: '', validator: APPROVER, timestamp: 1 },
    ],
  });
});

afterEach(() => {
  MilestoneEndorsementStore.resetInstance();
  SessionStore.resetInstance();
});

describe('GET /api/milestones/:playerId/:milestoneId/endorsements', () => {
  it('returns an empty list when nobody has endorsed yet', async () => {
    const res = await GET(makeGetRequest(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.endorsements).toEqual([]);
  });

  it('lists recorded endorsements', async () => {
    MilestoneEndorsementStore.getInstance().add('player-1', 'milestone-1', APPROVER);
    const res = await GET(makeGetRequest(), params);
    const body = await res.json();
    expect(body.endorsements).toHaveLength(1);
    expect(body.endorsements[0].wallet).toBe(APPROVER);
  });
});

describe('POST /api/milestones/:playerId/:milestoneId/endorsements', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(makePostRequest(), params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not a validator', async () => {
    mockCheckIsValidator.mockResolvedValue(false);
    const res = await POST(makePostRequest(authedCookie()), params);
    expect(res.status).toBe(403);
  });

  it('returns 404 when the milestone does not exist', async () => {
    mockGetPlayer.mockResolvedValue({ milestones: [] });
    const res = await POST(makePostRequest(authedCookie()), params);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller isn't a member of the same academy as the approving validator", async () => {
    mockFetchAcademyForWallet.mockImplementation(async (wallet: string) => {
      if (wallet === APPROVER) return makeAcademy();
      return null; // caller has no academy
    });

    const res = await POST(makePostRequest(authedCookie()), params);
    expect(res.status).toBe(403);
    expect(
      MilestoneEndorsementStore.getInstance().listFor('player-1', 'milestone-1'),
    ).toHaveLength(0);
  });

  it('records an endorsement when the caller is a validator and a member of the same academy', async () => {
    const academy = makeAcademy();
    mockFetchAcademyForWallet.mockResolvedValue(academy);

    const res = await POST(makePostRequest(authedCookie()), params);
    expect(res.status).toBe(200);

    const endorsements = MilestoneEndorsementStore.getInstance().listFor(
      'player-1',
      'milestone-1',
    );
    expect(endorsements).toHaveLength(1);
    expect(endorsements[0].wallet).toBe(WALLET);
  });

  it('is idempotent when the same wallet endorses twice', async () => {
    mockFetchAcademyForWallet.mockResolvedValue(makeAcademy());

    await POST(makePostRequest(authedCookie()), params);
    await POST(makePostRequest(authedCookie()), params);

    expect(
      MilestoneEndorsementStore.getInstance().listFor('player-1', 'milestone-1'),
    ).toHaveLength(1);
  });
});
