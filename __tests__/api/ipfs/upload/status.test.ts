/** @jest-environment node */
import { GET } from '@/app/api/ipfs/upload/status/route';
import { NextRequest } from 'next/server';
import {
  initSession,
  writeChunk,
  __resetForTests,
} from '@/lib/chunkedUploadStore';

function makeRequest(sessionId?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/ipfs/upload/status');
  if (sessionId !== undefined) url.searchParams.set('sessionId', sessionId);
  return new NextRequest(url);
}

afterEach(() => __resetForTests());

describe('GET /api/ipfs/upload/status', () => {
  it('returns 400 when sessionId is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await GET(makeRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('reports which chunks have been received, enabling resume', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));
    await writeChunk(sessionId, 2, Buffer.from('cc'));

    const res = await GET(makeRequest(sessionId));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      receivedChunks: [0, 2],
      totalChunks: 3,
    });
  });
});
