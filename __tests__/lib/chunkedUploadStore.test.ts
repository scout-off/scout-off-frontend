/** @jest-environment node */
import {
  initSession,
  getSessionStatus,
  writeChunk,
  assembleFile,
  cleanupSession,
  listSessionsForWallet,
  clearSessionsForWallet,
  __resetForTests,
} from '@/lib/chunkedUploadStore';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // must match lib/chunkedUploadStore.ts

afterEach(() => {
  __resetForTests();
  jest.restoreAllMocks();
});

describe('chunkedUploadStore', () => {
  it('starts a session and reports zero received chunks', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });

    expect(sessionId).toBeTruthy();
    expect(await getSessionStatus(sessionId)).toEqual({
      receivedChunks: [],
      totalChunks: 3,
    });
  });

  it('returns null status for an unknown session', async () => {
    expect(await getSessionStatus('does-not-exist')).toBeNull();
  });

  it('writes chunks and tracks which indices have been received', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 20,
      totalChunks: 3,
    });

    await writeChunk(sessionId, 1, Buffer.from('bbbbbbbbbb'));
    const status = await writeChunk(sessionId, 0, Buffer.from('aaaaaaaaaa'));

    expect(status).toEqual({ receivedChunks: [0, 1], totalChunks: 3 });
  });

  it('re-uploading the same chunk index overwrites it (idempotent retry)', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 14,
      totalChunks: 1,
    });

    await writeChunk(sessionId, 0, Buffer.from('first-attempt'));
    await writeChunk(sessionId, 0, Buffer.from('second-attempt'));

    const { buffer } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('second-attempt');
  });

  it('rejects a chunk index outside [0, totalChunks)', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 2,
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
    const { sessionId } = await initSession({
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
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 4,
      totalChunks: 2,
    });

    await writeChunk(sessionId, 0, Buffer.from('aa'));

    await expect(assembleFile(sessionId)).rejects.toThrow(/incomplete/i);
  });

  it('cleanupSession removes the session so it can no longer be used', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 2,
      totalChunks: 1,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));

    await cleanupSession(sessionId);

    expect(await getSessionStatus(sessionId)).toBeNull();
    await expect(assembleFile(sessionId)).rejects.toThrow(
      /not found or expired/i,
    );
  });

  it('cleanupSession on an unknown session is a harmless no-op', async () => {
    await expect(cleanupSession('does-not-exist')).resolves.not.toThrow();
  });

  it('proactively sweeps a session abandoned past its TTL without a new initSession call', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 9,
      totalChunks: 1,
    });
    await writeChunk(sessionId, 0, Buffer.from('abandoned'));
    expect(await getSessionStatus(sessionId)).not.toBeNull();

    // Advance past the TTL without ever calling initSession again.
    nowSpy.mockReturnValue(realNow + SESSION_TTL_MS + 1);

    expect(await getSessionStatus(sessionId)).toBeNull();
  });

  it('writeChunk on an unrelated session also proactively sweeps expired sessions', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

    const expired = await initSession({
      filename: 'old.mp4',
      fileType: 'video/mp4',
      fileSize: 5,
      totalChunks: 1,
    });
    await writeChunk(expired.sessionId, 0, Buffer.from('stale'));

    // A second session created 1s later, before `expired` has aged out —
    // both sessions co-exist at this point.
    nowSpy.mockReturnValue(realNow + 1000);
    const fresh = await initSession({
      filename: 'new.mp4',
      fileType: 'video/mp4',
      fileSize: 6,
      totalChunks: 1,
    });

    // Advance past `expired`'s TTL, but not past `fresh`'s (created 1s later).
    nowSpy.mockReturnValue(realNow + SESSION_TTL_MS + 500);

    // No new initSession call here: writeChunk on the still-fresh session
    // is what must trigger the sweep of the unrelated expired one.
    await writeChunk(fresh.sessionId, 0, Buffer.from('active'));

    expect(await getSessionStatus(expired.sessionId)).toBeNull();
    expect(await getSessionStatus(fresh.sessionId)).toEqual({
      receivedChunks: [0],
      totalChunks: 1,
    });
  });

  it('listSessionsForWallet returns only sessions owned by that wallet', async () => {
    const a = await initSession({
      filename: 'mine.mp4',
      fileType: 'video/mp4',
      fileSize: 1,
      totalChunks: 1,
      ownerWallet: 'GWALLETA',
    });
    await initSession({
      filename: 'theirs.mp4',
      fileType: 'video/mp4',
      fileSize: 1,
      totalChunks: 1,
      ownerWallet: 'GWALLETB',
    });
    await writeChunk(a.sessionId, 0, Buffer.from('x'));

    const summaries = await listSessionsForWallet('GWALLETA');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      sessionId: a.sessionId,
      filename: 'mine.mp4',
      receivedChunks: 1,
      totalChunks: 1,
    });
  });

  it("clearSessionsForWallet removes only that wallet's sessions and returns the count", async () => {
    await initSession({
      filename: 'mine.mp4',
      fileType: 'video/mp4',
      fileSize: 1,
      totalChunks: 1,
      ownerWallet: 'GWALLETA',
    });
    const other = await initSession({
      filename: 'theirs.mp4',
      fileType: 'video/mp4',
      fileSize: 1,
      totalChunks: 1,
      ownerWallet: 'GWALLETB',
    });

    const removed = await clearSessionsForWallet('GWALLETA');

    expect(removed).toBe(1);
    expect(await listSessionsForWallet('GWALLETA')).toEqual([]);
    expect(await getSessionStatus(other.sessionId)).not.toBeNull();
  });

  it('a resumed upload works correctly regardless of which "instance" received earlier chunks (issue #1175)', async () => {
    // Simulates two different serverless instances sharing metadata/chunk
    // storage: initSession + first chunk happen against one handle to the
    // store, then a fresh call — modeling a resume request landing on a
    // different instance — must see exactly the same state, because both
    // the session metadata and the chunk bytes live in shared storage
    // (Redis/SQLite when configured, or this single in-memory process in
    // tests) rather than a given instance's local memory/disk.
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 6,
      totalChunks: 3,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));

    // "Resume" landing elsewhere: checks status, then submits the remaining
    // chunks purely by sessionId, with no dependency on prior in-process state.
    const resumeStatus = await getSessionStatus(sessionId);
    expect(resumeStatus).toEqual({ receivedChunks: [0], totalChunks: 3 });

    const missing = Array.from(
      { length: resumeStatus!.totalChunks },
      (_, i) => i,
    ).filter((i) => !resumeStatus!.receivedChunks.includes(i));
    expect(missing).toEqual([1, 2]);

    await writeChunk(sessionId, 1, Buffer.from('bb'));
    await writeChunk(sessionId, 2, Buffer.from('cc'));

    const { buffer } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('aabbcc');
  });
});
