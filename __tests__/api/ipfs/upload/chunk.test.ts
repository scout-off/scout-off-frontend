/** @jest-environment node */
import { POST } from '@/app/api/ipfs/upload/chunk/route';
import { NextRequest } from 'next/server';
import {
  initSession,
  getSessionStatus,
  __resetForTests,
} from '@/lib/chunkedUploadStore';

function makeRequest(form: FormData, ip = 'ip-chunk-default'): NextRequest {
  return new NextRequest('http://localhost:3000/api/ipfs/upload/chunk', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: form,
  });
}

afterEach(() => __resetForTests());

describe('POST /api/ipfs/upload/chunk', () => {
  it('writes a chunk and returns the updated received-chunk status', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 20,
      totalChunks: 2,
    });

    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('chunkIndex', '0');
    form.set('chunk', new Blob([new Uint8Array(10)]));

    const res = await POST(makeRequest(form, 'ip-chunk-ok'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ receivedChunks: [0], totalChunks: 2 });
    expect(getSessionStatus(sessionId)?.receivedChunks).toEqual([0]);
  });

  it('returns 400 when sessionId is missing', async () => {
    const form = new FormData();
    form.set('chunkIndex', '0');
    form.set('chunk', new Blob([new Uint8Array(1)]));

    const res = await POST(makeRequest(form, 'ip-nosession'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when chunkIndex is not a non-negative integer', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('chunkIndex', 'abc');
    form.set('chunk', new Blob([new Uint8Array(1)]));

    const res = await POST(makeRequest(form, 'ip-badindex'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when chunk is missing', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('chunkIndex', '0');

    const res = await POST(makeRequest(form, 'ip-nochunk'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown session', async () => {
    const form = new FormData();
    form.set('sessionId', 'does-not-exist');
    form.set('chunkIndex', '0');
    form.set('chunk', new Blob([new Uint8Array(1)]));

    const res = await POST(makeRequest(form, 'ip-unknownsession'));
    expect(res.status).toBe(404);
  });

  it('re-uploading the same chunk index (a client retry) succeeds and does not duplicate it', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });

    for (let i = 0; i < 2; i++) {
      const form = new FormData();
      form.set('sessionId', sessionId);
      form.set('chunkIndex', '0');
      form.set('chunk', new Blob([new Uint8Array(10)]));
      const res = await POST(makeRequest(form, 'ip-chunk-retry'));
      expect(res.status).toBe(200);
    }

    expect(getSessionStatus(sessionId)?.receivedChunks).toEqual([0]);
  });
});
