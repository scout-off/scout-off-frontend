/** @jest-environment node */
import { POST as ChunkPOST } from '@/app/api/ipfs/upload/chunk/route';
import { POST as CompletePOST } from '@/app/api/ipfs/upload/complete/route';
import { NextRequest } from 'next/server';
import {
  initSession,
  writeChunk,
  assembleFile,
  getSessionStatus,
  CHUNK_SIZE_BYTES,
  __resetForTests,
} from '@/lib/chunkedUploadStore';
import { ChunkedUploadChunkStore } from '@/lib/chunkedUploadChunkStore';

function chunkRequest(form: FormData, ip: string, cl?: string): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/ipfs/upload/chunk', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: form,
  });
  // NextRequest (undici) computes content-length from the body; override it
  // after construction to simulate a lying/large header for the pre-check.
  // Headers is mutable on NextRequest in this Next version.
  if (cl !== undefined) {
    try {
      req.headers.set('content-length', cl);
    } catch {
      // If headers ever become immutable, fall back to rebuilding — tests
      // would need the RequestInit path instead.
    }
  }
  return req;
}
function chunkForm(sid: string, i: number, b: Uint8Array | Buffer): FormData {
  const f = new FormData();
  f.set('sessionId', sid);
  f.set('chunkIndex', String(i));
  f.set('chunk', new Blob([b as unknown as BlobPart]));
  return f;
}
afterEach(() => __resetForTests());
describe('issue #1294 chunk size enforcement', () => {
  it('rejects a chunk larger than CHUNK_SIZE_BYTES with 413', async () => {
    const fileSize = CHUNK_SIZE_BYTES + 10;
    const { sessionId } = await initSession({
      filename: 'big.mp4', fileType: 'video/mp4', fileSize, totalChunks: 2,
    });
    const oversized = Buffer.alloc(CHUNK_SIZE_BYTES + 1, 0x61);
    const res = await ChunkPOST(
      chunkRequest(chunkForm(sessionId, 0, oversized), 'ip-1294-oversize'));
    expect(res.status).toBe(413);
    expect(ChunkedUploadChunkStore.getInstance().getChunkSize(sessionId, 0)).toBeNull();
  });
  it('rejects huge Content-Length before buffering', async () => {
    const { sessionId } = await initSession({
      filename: 'big.mp4', fileType: 'video/mp4', fileSize: 20, totalChunks: 2,
    });
    const res = await ChunkPOST(chunkRequest(
      chunkForm(sessionId, 0, new Uint8Array([1, 2, 3])),
      'ip-1294-cl', String(CHUNK_SIZE_BYTES + 64 * 1024 + 1)));
    expect(res.status).toBe(413);
  });
  it('rejects running-total overflow with 413', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4', fileType: 'video/mp4', fileSize: 10, totalChunks: 2,
    });
    const first = await ChunkPOST(chunkRequest(
      chunkForm(sessionId, 0, Buffer.alloc(8, 0x61)), 'ip-1294-t1'));
    expect(first.status).toBe(200);
    const second = await ChunkPOST(chunkRequest(
      chunkForm(sessionId, 1, Buffer.alloc(8, 0x62)), 'ip-1294-t2'));
    expect(second.status).toBe(413);
  });
  it('store-level writeChunk enforces both limits', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4', fileType: 'video/mp4', fileSize: 10, totalChunks: 2,
    });
    await expect(writeChunk(sessionId, 0,
      Buffer.alloc(CHUNK_SIZE_BYTES + 1, 0x61))).rejects.toThrow(/exceeds.*limit/i);
    await writeChunk(sessionId, 0, Buffer.alloc(8, 0x61));
    await expect(writeChunk(sessionId, 1,
      Buffer.alloc(8, 0x62))).rejects.toThrow(/declared file size/i);
  });
  it('assembleFile mismatch cleans up session', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4', fileType: 'video/mp4', fileSize: 6, totalChunks: 2,
    });
    const store = ChunkedUploadChunkStore.getInstance();
    await writeChunk(sessionId, 0, Buffer.from('aaa'));
    await writeChunk(sessionId, 1, Buffer.from('bbb'));
    // Tamper out-of-band: overwrite one chunk with extra bytes so the
    // assembled total (7) mismatches declared (6).
    store.writeChunk(sessionId, 1, Buffer.from('bbbb'));
    await expect(assembleFile(sessionId)).rejects.toThrow(/does not match/i);
    expect(await getSessionStatus(sessionId)).toBeNull();
    expect(store.totalBytes(sessionId)).toBe(0);
  });
  it('accepts a legitimate multi-chunk upload end to end', async () => {
    const chunkA = Buffer.from('aa');
    const chunkB = Buffer.from('bb');
    const { sessionId } = await initSession({
      filename: 'clip.mp4', fileType: 'video/mp4',
      fileSize: chunkA.length + chunkB.length, totalChunks: 2,
    });
    const r0 = await ChunkPOST(chunkRequest(
      chunkForm(sessionId, 0, chunkA), 'ip-1294-legit-0'));
    expect(r0.status).toBe(200);
    expect(await r0.json()).toEqual({ receivedChunks: [0], totalChunks: 2 });
    const r1 = await ChunkPOST(chunkRequest(
      chunkForm(sessionId, 1, chunkB), 'ip-1294-legit-1'));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ receivedChunks: [0, 1], totalChunks: 2 });
    const { buffer } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('aabb');
  });
  it('/complete returns 400 and cleans up on size mismatch', async () => {
    const header = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const { sessionId } = await initSession({
      filename: 'photo.jpg', fileType: 'image/jpeg',
      fileSize: header.length + 8, totalChunks: 1,
    });
    // Record receipt with a matching-size chunk, then trim the stored bytes
    // out-of-band so assembly sees fewer bytes than declared: /complete
    // must fail the size check with 400 and drop the session.
    // (Spread into plain arrays to dodge @types/node's Buffer-vs-ArrayBuffer
    // generic mismatch under this repo's DOM-lib-inclusive tsconfig.)
    const fullBytes = [...header, ...new Array<number>(8).fill(1)];
    await writeChunk(sessionId, 0, Buffer.from(fullBytes));
    ChunkedUploadChunkStore.getInstance().writeChunk(sessionId, 0, Buffer.from([...header]));
    const res = await CompletePOST(new NextRequest(
      'http://localhost:3000/api/ipfs/upload/complete',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': 'ip-1294-complete' },
        body: JSON.stringify({ sessionId }),
      },
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not match/i);
    expect(await getSessionStatus(sessionId)).toBeNull();
  });
});
