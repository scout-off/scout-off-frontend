/** @jest-environment node */
import { POST } from '@/app/api/uploads/track/route';
import { NextRequest } from 'next/server';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/uploads/track', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': '203.0.113.5' },
  });
}

beforeEach(() => {
  UploadTrackingStore.resetInstance();
});

afterEach(() => {
  UploadTrackingStore.resetInstance();
});

describe('POST /api/uploads/track', () => {
  it('rejects a request missing cid', async () => {
    const res = await POST(
      makeRequest({ context: 'player_onboarding_highlight_reel' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized context', async () => {
    const res = await POST(makeRequest({ cid: 'QmABC', context: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('records a pending upload and returns its id', async () => {
    const res = await POST(
      makeRequest({
        cid: 'QmABC',
        wallet: 'GWALLET1',
        context: 'player_onboarding_highlight_reel',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('number');

    const stored = UploadTrackingStore.getInstance().getByCid('QmABC');
    expect(stored).toHaveLength(1);
    expect(stored[0].wallet).toBe('GWALLET1');
    expect(stored[0].matchedAt).toBeNull();
  });

  it('stores a null wallet when none is provided', async () => {
    await POST(
      makeRequest({
        cid: 'QmNoWallet',
        context: 'player_onboarding_highlight_reel',
      }),
    );
    const stored = UploadTrackingStore.getInstance().getByCid('QmNoWallet');
    expect(stored[0].wallet).toBeNull();
  });
});
