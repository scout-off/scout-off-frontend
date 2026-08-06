import { NextRequest, NextResponse } from 'next/server';
import { writeChunk } from '@/lib/chunkedUploadStore';
import { getClientIp, createRateLimiter } from '@/lib/uploadRateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/ipfs/upload/chunk
 *
 * Uploads one chunk of an in-progress session (multipart form:
 * `sessionId`, `chunkIndex`, `chunk`). Idempotent per index — re-uploading
 * the same chunk after a retry just overwrites it — so the client's
 * per-chunk retry loop (lib/ipfs.ts's uploadToIPFSChunked) doesn't need to
 * coordinate anything beyond "did this request succeed."
 *
 * A single upload legitimately issues many small requests here, so this
 * route's rate limit is much higher than the whole-file upload route's.
 */
const checkRateLimit = createRateLimiter(600, 60 * 1000);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (rl.limited) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const sessionId = form.get('sessionId');
  const chunkIndexRaw = form.get('chunkIndex');
  const chunk = form.get('chunk');

  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 },
    );
  }
  if (typeof chunkIndexRaw !== 'string' || !/^\d+$/.test(chunkIndexRaw)) {
    return NextResponse.json(
      { error: 'chunkIndex must be a non-negative integer' },
      { status: 400 },
    );
  }
  if (!(chunk instanceof Blob)) {
    return NextResponse.json({ error: 'chunk is required' }, { status: 400 });
  }

  const chunkIndex = Number(chunkIndexRaw);
  const buffer = Buffer.from(await chunk.arrayBuffer());

  try {
    const status = await writeChunk(sessionId, chunkIndex, buffer);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to write chunk' },
      { status: 404 },
    );
  }
}
