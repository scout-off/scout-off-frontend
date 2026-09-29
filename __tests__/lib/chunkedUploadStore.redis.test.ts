/**
 * lib/chunkedUploadStore.ts is the fix for issue #1175: the store used to
 * keep an in-memory session `Map` and write chunk bytes to a given
 * instance's own os.tmpdir() — only correct for a single, long-running Node
 * process. These tests simulate a "different instance" scenario directly,
 * mirroring __tests__/lib/rateLimit.test.ts's approach for the identical
 * class of bug it already fixed:
 *
 *  - Session metadata is backed by a mocked Upstash Redis client with a
 *    backing store shared across every `new Redis(...)` call pointed at the
 *    same url/token — exactly how real Upstash is shared across serverless
 *    instances.
 *  - Chunk bytes are backed by a real on-disk SQLite file (not `:memory:`),
 *    so closing and reopening the store's DB connection — standing in for
 *    a fresh instance's own connection — still reads back chunks a prior
 *    connection wrote.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Mock @upstash/redis with a shared backing store (mirrors rateLimit.test.ts) ──
type MockEntry = { value: unknown; expiresAt: number };

jest.mock('@upstash/redis', () => {
  const backingStores = new Map<
    string,
    { kv: Map<string, MockEntry>; sets: Map<string, Set<string>> }
  >();

  class MockRedis {
    private kv: Map<string, MockEntry>;
    private sets: Map<string, Set<string>>;

    constructor(opts: { url: string; token: string }) {
      const backingKey = `${opts.url}:${opts.token}`;
      let backing = backingStores.get(backingKey);
      if (!backing) {
        backing = { kv: new Map(), sets: new Map() };
        backingStores.set(backingKey, backing);
      }
      this.kv = backing.kv;
      this.sets = backing.sets;
    }

    async psetex(key: string, ttlMs: number, value: unknown): Promise<string> {
      this.kv.set(key, { value, expiresAt: Date.now() + ttlMs });
      return 'OK';
    }

    async get<T>(key: string): Promise<T | null> {
      const entry = this.kv.get(key);
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt) {
        this.kv.delete(key);
        return null;
      }
      return entry.value as T;
    }

    async del(key: string): Promise<number> {
      return this.kv.delete(key) ? 1 : 0;
    }

    async sadd(key: string, member: string): Promise<number> {
      let set = this.sets.get(key);
      if (!set) {
        set = new Set();
        this.sets.set(key, set);
      }
      const before = set.size;
      set.add(member);
      return set.size > before ? 1 : 0;
    }

    async srem(key: string, ...members: string[]): Promise<number> {
      const set = this.sets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const m of members) {
        if (set.delete(m)) removed++;
      }
      return removed;
    }

    async smembers<T extends unknown[] = string[]>(key: string): Promise<T> {
      return Array.from(this.sets.get(key) ?? []) as unknown as T;
    }
  }

  return { Redis: MockRedis, __mockBackingStores: backingStores };
});

import {
  initSession,
  getSessionStatus,
  writeChunk,
  assembleFile,
  listSessionsForWallet,
  _resetMetadataCacheForTests,
  __resetForTests,
} from '@/lib/chunkedUploadStore';
import { ChunkedUploadChunkStore } from '@/lib/chunkedUploadChunkStore';

const { __mockBackingStores } = jest.requireMock('@upstash/redis') as {
  __mockBackingStores: Map<string, unknown>;
};

describe('chunkedUploadStore with Upstash Redis configured (issue #1175)', () => {
  const ORIGINAL_ENV = process.env;
  let dbPath: string;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
    dbPath = path.join(
      os.tmpdir(),
      `chunked-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    process.env.CHUNKED_UPLOAD_DB_PATH = dbPath;
    __mockBackingStores.clear();
    __resetForTests();
  });

  afterEach(() => {
    __resetForTests();
    process.env = ORIGINAL_ENV;
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rm(dbPath + suffix, { force: true }, () => {});
    }
  });

  it('a resumed upload works correctly when the resuming request lands on a different instance (real bug this fixes)', async () => {
    const { sessionId } = await initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 6,
      totalChunks: 3,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));

    // Simulate the resuming request landing on a DIFFERENT instance: drop
    // this process's cached Redis client (a cold-started instance would
    // construct its own) AND close/discard the chunk store's SQLite
    // connection (a different instance would open its own connection to
    // the same shared-volume file). Neither the metadata nor the chunk
    // bytes should be lost, because both live in storage shared across
    // instances rather than this process's own memory/connection.
    _resetMetadataCacheForTests();
    ChunkedUploadChunkStore.resetInstance();

    const resumeStatus = await getSessionStatus(sessionId);
    expect(resumeStatus).toEqual({ receivedChunks: [0], totalChunks: 3 });

    await writeChunk(sessionId, 1, Buffer.from('bb'));

    // Simulate the request lands on yet another instance for the final chunk.
    _resetMetadataCacheForTests();
    ChunkedUploadChunkStore.resetInstance();

    await writeChunk(sessionId, 2, Buffer.from('cc'));

    const { buffer, filename, fileType } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('aabbcc');
    expect(filename).toBe('clip.mp4');
    expect(fileType).toBe('video/mp4');
  });

  it('session metadata written by one client is visible to a fresh client pointed at the same Redis database', async () => {
    const { sessionId } = await initSession({
      filename: 'a.jpg',
      fileType: 'image/jpeg',
      fileSize: 1,
      totalChunks: 1,
      ownerWallet: 'GWALLET',
    });

    _resetMetadataCacheForTests();

    expect(await getSessionStatus(sessionId)).toEqual({
      receivedChunks: [],
      totalChunks: 1,
    });
    expect(await listSessionsForWallet('GWALLET')).toHaveLength(1);
  });

  it('an unknown session still returns null through the Redis-backed store', async () => {
    expect(await getSessionStatus('does-not-exist')).toBeNull();
  });
});
