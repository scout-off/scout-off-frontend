/** @jest-environment node */
jest.mock('@/lib/pinataUnpin', () => ({
  unpinFromPinata: jest.fn(),
}));

import { GET, POST } from '@/app/api/admin/orphaned-uploads/route';
import { NextRequest } from 'next/server';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';
import { unpinFromPinata } from '@/lib/pinataUnpin';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const mockUnpinFromPinata = unpinFromPinata as jest.Mock;

let sidCounter = 0;

function makeRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    // #1179: getSessionWallet also requires an active SessionStore row.
    const sid = `sid-${sidCounter++}`;
    SessionStore.getInstance().create(sid, cookie, Date.now() + 60 * 60 * 1000);
    headers['cookie'] =
      `session=${createSessionToken(cookie, 'access', 20 * 60, { sid })}`;
  }
  return new NextRequest('http://localhost/api/admin/orphaned-uploads', {
    headers,
  });
}

const GRACE_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  UploadTrackingStore.resetInstance();
  SessionStore.resetInstance();
  mockUnpinFromPinata.mockReset();
  mockUnpinFromPinata.mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  UploadTrackingStore.resetInstance();
  SessionStore.resetInstance();
});

describe('GET /api/admin/orphaned-uploads', () => {
  it('returns 403 without an admin session', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin session', async () => {
    const res = await GET(makeRequest('GSOMEONEELSE'));
    expect(res.status).toBe(403);
  });

  it('lists only unmatched records older than the grace period', async () => {
    const store = UploadTrackingStore.getInstance();
    const now = Date.now();
    store.recordUpload({
      cid: 'QmOrphan',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: now - GRACE_MS - 1000,
    });
    store.recordUpload({
      cid: 'QmRecent',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: now,
    });

    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].cid).toBe('QmOrphan');
  });
});

describe('POST /api/admin/orphaned-uploads', () => {
  it('returns 403 without an admin session', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(mockUnpinFromPinata).not.toHaveBeenCalled();
  });

  it('attempts to unpin every orphan candidate and marks each cleaned', async () => {
    const store = UploadTrackingStore.getInstance();
    const now = Date.now();
    store.recordUpload({
      cid: 'QmOrphan1',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: now - GRACE_MS - 1000,
    });
    store.recordUpload({
      cid: 'QmOrphan2',
      wallet: 'GWALLET2',
      context: 'player_onboarding_highlight_reel',
      createdAt: now - GRACE_MS - 2000,
    });

    const res = await POST(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ attempted: 2, unpinned: 2, unpinFailed: 0 });
    expect(mockUnpinFromPinata).toHaveBeenCalledWith('QmOrphan1');
    expect(mockUnpinFromPinata).toHaveBeenCalledWith('QmOrphan2');

    // A repeated run should find nothing left to clean.
    const second = await POST(makeRequest(ADMIN));
    const secondBody = await second.json();
    expect(secondBody.attempted).toBe(0);
  });

  it('still marks a record cleaned when the unpin call itself fails', async () => {
    mockUnpinFromPinata.mockResolvedValue({ ok: false, error: 'boom' });
    const store = UploadTrackingStore.getInstance();
    store.recordUpload({
      cid: 'QmWillFail',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: Date.now() - GRACE_MS - 1000,
    });

    const res = await POST(makeRequest(ADMIN));
    const body = await res.json();
    expect(body).toEqual({ attempted: 1, unpinned: 0, unpinFailed: 1 });

    expect(store.getOrphanCandidates(GRACE_MS)).toEqual([]);
  });
});
