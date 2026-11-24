/** @jest-environment node */
import { POST } from '@/app/api/uploads/track/match/route';
import { NextRequest } from 'next/server';
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/uploads/track/match', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
}

beforeEach(() => {
  UploadTrackingStore.resetInstance();
});

afterEach(() => {
  UploadTrackingStore.resetInstance();
});

describe('POST /api/uploads/track/match', () => {
  it('rejects a request missing cid', async () => {
    const res = await POST(makeRequest({ txHash: 'tx-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when there is no pending record for the cid', async () => {
    const res = await POST(makeRequest({ cid: 'QmNoSuchCid', txHash: 'tx-1' }));
    expect(res.status).toBe(404);
  });

  it('marks a pending tracked upload as matched', async () => {
    UploadTrackingStore.getInstance().recordUpload({
      cid: 'QmABC',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
    });

    const res = await POST(makeRequest({ cid: 'QmABC', txHash: 'tx-hash-1' }));
    expect(res.status).toBe(200);

    const [stored] = UploadTrackingStore.getInstance().getByCid('QmABC');
    expect(stored.matchedAt).not.toBeNull();
    expect(stored.matchedTxHash).toBe('tx-hash-1');
  });
});
