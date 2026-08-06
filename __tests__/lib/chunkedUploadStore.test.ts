/** @jest-environment node */
import {
  initSession,
  getSessionStatus,
  writeChunk,
  assembleFile,
  cleanupSession,
  __resetForTests,
} from '@/lib/chunkedUploadStore';

afterEach(() => {
  __resetForTests();
});

describe('chunkedUploadStore', () => {
  it('starts a session and reports zero received chunks', () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });

    expect(sessionId).toBeTruthy();
    expect(getSessionStatus(sessionId)).toEqual({
      receivedChunks: [],
      totalChunks: 3,
    });
  });

  it('returns null status for an unknown session', () => {
    expect(getSessionStatus('does-not-exist')).toBeNull();
  });

  it('writes chunks and tracks which indices have been received', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });

    await writeChunk(sessionId, 1, Buffer.from('bbbbbbbbbb'));
    const status = await writeChunk(sessionId, 0, Buffer.from('aaaaaaaaaa'));

    expect(status).toEqual({ receivedChunks: [0, 1], totalChunks: 3 });
  });

  it('re-uploading the same chunk index overwrites it (idempotent retry)', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });

    await writeChunk(sessionId, 0, Buffer.from('first-attempt'));
    await writeChunk(sessionId, 0, Buffer.from('second-attempt'));

    const { buffer } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('second-attempt');
  });

  it('rejects a chunk index outside [0, totalChunks)', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 2,
    });

    await expect(writeChunk(sessionId, 2, Buffer.from('x'))).rejects.toThrow(
      /out of range/i,
    );
    await expect(writeChunk(sessionId, -1, Buffer.from('x'))).rejects.toThrow(
      /out of range/i,
    );
  });

  it('rejects writing a chunk to an unknown session', async () => {
    await expect(writeChunk('nope', 0, Buffer.from('x'))).rejects.toThrow(
      /not found or expired/i,
    );
  });

  it('assembles chunks in index order regardless of upload order', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 6,
      totalChunks: 3,
    });

    await writeChunk(sessionId, 2, Buffer.from('cc'));
    await writeChunk(sessionId, 0, Buffer.from('aa'));
    await writeChunk(sessionId, 1, Buffer.from('bb'));

    const { buffer, filename, fileType } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('aabbcc');
    expect(filename).toBe('clip.mp4');
    expect(fileType).toBe('video/mp4');
  });

  it('refuses to assemble an incomplete upload', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 20,
      totalChunks: 2,
    });

    await writeChunk(sessionId, 0, Buffer.from('aa'));

    await expect(assembleFile(sessionId)).rejects.toThrow(/incomplete/i);
  });

  it('cleanupSession removes the session so it can no longer be used', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 2,
      totalChunks: 1,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));

    cleanupSession(sessionId);

    expect(getSessionStatus(sessionId)).toBeNull();
    await expect(assembleFile(sessionId)).rejects.toThrow(
      /not found or expired/i,
    );
  });

  it('cleanupSession on an unknown session is a harmless no-op', () => {
    expect(() => cleanupSession('does-not-exist')).not.toThrow();
  });
});
