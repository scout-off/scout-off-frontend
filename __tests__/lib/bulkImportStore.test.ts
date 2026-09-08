/**
 * Unit tests for lib/bulkImportStore.ts — IndexedDB-backed persistence for
 * resumable multi-row bulk player registration.
 *
 * bulkImportStore.ts is backed by IndexedDB, which jsdom does not implement.
 * `fake-indexeddb/auto` installs an in-memory, spec-compliant IndexedDB on the
 * global object so the real (unmocked) module code — including the
 * `onupgradeneeded` object-store/index creation path — runs for real. The
 * module caches its DB connection in a module-level promise, so each test
 * resets the module registry and swaps in a fresh IndexedDB.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TextEncoder as NodeTextEncoder } from 'util';
import { webcrypto } from 'crypto';

// jsdom in this environment exposes neither TextEncoder nor WebCrypto's
// subtle API on the global object; hashFileContent() needs both.
if (typeof (globalThis as any).TextEncoder !== 'function') {
  (globalThis as any).TextEncoder = NodeTextEncoder;
}
if (!(globalThis as any).crypto?.subtle) {
  // jsdom installs a non-writable `crypto` global (getRandomValues only, no
  // `subtle`); defineProperty past it with the full WebCrypto implementation.
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}
if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value));
}

type BulkImportStoreModule = typeof import('@/lib/bulkImportStore');

async function loadModule(): Promise<BulkImportStoreModule> {
  let mod!: BulkImportStoreModule;
  await jest.isolateModulesAsync(async () => {
    mod = await import('@/lib/bulkImportStore');
  });
  return mod;
}

beforeEach(() => {
  // Fresh, empty IndexedDB for every test — and a fresh module registry so the
  // cached DB-connection promise inside the store points at it.
  (globalThis as any).indexedDB = new IDBFactory();
  jest.resetModules();
});

describe('hashFileContent', () => {
  it('produces a stable 64-char hex SHA-256 digest', async () => {
    const { hashFileContent } = await loadModule();
    const a = await hashFileContent('row1,row2\n');
    const b = await hashFileContent('row1,row2\n');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('yields different digests for different content', async () => {
    const { hashFileContent } = await loadModule();
    expect(await hashFileContent('a')).not.toBe(await hashFileContent('b'));
  });
});

describe('getOrCreateSession', () => {
  it('creates a new session for an unseen file hash', async () => {
    const { getOrCreateSession } = await loadModule();
    const session = await getOrCreateSession('hash-abc', 'players.csv');

    expect(session.fileHash).toBe('hash-abc');
    expect(session.fileName).toBe('players.csv');
    expect(session.sessionId).toContain('hash-abc');
    expect(session.rows).toBeInstanceOf(Map);
    expect(session.rows.size).toBe(0);
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it('resumes the existing session for a known file hash', async () => {
    const mod = await loadModule();
    const first = await mod.getOrCreateSession('hash-abc', 'players.csv');
    await mod.updateRowStatus(first.sessionId, 2, 'success', '0xdeadbeef');

    const resumed = await mod.getOrCreateSession('hash-abc', 'renamed.csv');

    expect(resumed.sessionId).toBe(first.sessionId);
    expect(resumed.fileName).toBe('renamed.csv'); // updated on resume

    // Consumers always read row state back through getSessionRows().
    const rows = await mod.getSessionRows(resumed.sessionId);
    expect(rows.get(2)).toMatchObject({
      status: 'success',
      txHash: '0xdeadbeef',
    });
  });
});

describe('updateRowStatus / getSessionRows', () => {
  it('persists per-row status transitions', async () => {
    const mod = await loadModule();
    const { sessionId } = await mod.getOrCreateSession('h', 'f.csv');

    await mod.updateRowStatus(sessionId, 1, 'signing');
    await mod.updateRowStatus(sessionId, 1, 'success', '0xabc');
    await mod.updateRowStatus(sessionId, 2, 'failed', null, 'insufficient fee');

    const rows = await mod.getSessionRows(sessionId);
    expect(rows.get(1)).toMatchObject({ status: 'success', txHash: '0xabc' });
    expect(rows.get(2)).toMatchObject({
      status: 'failed',
      error: 'insufficient fee',
    });
  });

  it('rejects when updating a row on a missing session', async () => {
    const { updateRowStatus } = await loadModule();
    await expect(
      updateRowStatus('session_does_not_exist', 1, 'success'),
    ).rejects.toThrow(/not found/);
  });

  it('returns an empty map for an unknown session', async () => {
    const { getSessionRows } = await loadModule();
    expect((await getSessionRows('nope')).size).toBe(0);
  });
});

describe('deleteSession', () => {
  it('removes a session and its row state', async () => {
    const mod = await loadModule();
    const { sessionId } = await mod.getOrCreateSession('h', 'f.csv');
    await mod.updateRowStatus(sessionId, 1, 'success');

    await mod.deleteSession(sessionId);

    expect((await mod.getSessionRows(sessionId)).size).toBe(0);
  });

  it('resolves without error for an already-absent session', async () => {
    const { deleteSession } = await loadModule();
    await expect(deleteSession('never-existed')).resolves.toBeUndefined();
  });
});

describe('cleanupExpiredSessions', () => {
  it('deletes only sessions older than the max age', async () => {
    const mod = await loadModule();
    const nowSpy = jest.spyOn(Date, 'now');

    // Stale session, last active at t0.
    nowSpy.mockReturnValue(1_000_000_000_000);
    const stale = await mod.getOrCreateSession('stale-hash', 'old.csv');

    // Fresh session, last active 10 days later.
    nowSpy.mockReturnValue(1_000_000_000_000 + 10 * 24 * 60 * 60 * 1000);
    const fresh = await mod.getOrCreateSession('fresh-hash', 'new.csv');
    await mod.updateRowStatus(fresh.sessionId, 1, 'success');

    await mod.cleanupExpiredSessions(7 * 24 * 60 * 60 * 1000);

    // Stale one is gone…
    expect((await mod.getSessionRows(stale.sessionId)).size).toBe(0);
    // …while the fresh one survived with its row state intact.
    const freshRows = await mod.getSessionRows(fresh.sessionId);
    expect(freshRows.get(1)).toMatchObject({ status: 'success' });

    nowSpy.mockRestore();
  });
});
