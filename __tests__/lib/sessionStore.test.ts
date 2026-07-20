/** @jest-environment node */

// In-memory fake filesystem so tests don't touch the real .data/ directory.
jest.mock('fs', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    __files: files,
    __dirs: dirs,
    existsSync: jest.fn((p: string) => files.has(p) || dirs.has(p)),
    mkdirSync: jest.fn((p: string) => {
      dirs.add(p);
    }),
    readFileSync: jest.fn((p: string) => {
      if (!files.has(p)) throw new Error('ENOENT');
      return files.get(p);
    }),
    writeFileSync: jest.fn((p: string, data: string) => {
      files.set(p, data);
    }),
  };
});

import fs from 'fs';

interface FakeFs {
  __files: Map<string, string>;
  __dirs: Set<string>;
}

const fakeFs = fs as unknown as FakeFs;

function resetFakeFs() {
  fakeFs.__files.clear();
  fakeFs.__dirs.clear();
}

describe('sessionStore', () => {
  const PUBLIC_KEY = 'GPUBLICKEY0000000000000000000000000000000000000000000000';
  let nowSpy: jest.SpyInstance;
  let currentTime = 1_700_000_000_000;

  beforeEach(() => {
    jest.resetModules();
    resetFakeFs();
    currentTime = 1_700_000_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('createSession generates a unique id and a bounded expiry', () => {
    const { createSession } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);

    expect(session.publicKey).toBe(PUBLIC_KEY);
    expect(session.revoked).toBe(false);
    expect(session.createdAt).toBe(currentTime);
    expect(session.expiresAt).toBe(currentTime + 3600 * 1000);
    expect(typeof session.id).toBe('string');
    expect(session.id.length).toBeGreaterThan(0);
  });

  test('getValidSession returns the session for a fresh, unrevoked id', () => {
    const { createSession, getValidSession } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);
    const found = getValidSession(session.id);

    expect(found).toEqual(session);
  });

  test('getValidSession returns null for an unknown id', () => {
    const { getValidSession } = require('@/lib/sessionStore');

    expect(getValidSession('does-not-exist')).toBeNull();
  });

  test('getValidSession returns null once the session has expired', () => {
    const { createSession, getValidSession } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);
    currentTime += 3601 * 1000;

    expect(getValidSession(session.id)).toBeNull();
  });

  test('revokeSession invalidates the session immediately, before expiry', () => {
    const {
      createSession,
      getValidSession,
      revokeSession,
    } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);
    revokeSession(session.id);

    expect(getValidSession(session.id)).toBeNull();
  });

  test('revokeSession on an unknown id is a no-op', () => {
    const { revokeSession } = require('@/lib/sessionStore');

    expect(() => revokeSession('does-not-exist')).not.toThrow();
  });

  test('renewSession issues a new id, revokes the old one, and preserves the public key', () => {
    const {
      createSession,
      getValidSession,
      renewSession,
    } = require('@/lib/sessionStore');

    const original = createSession(PUBLIC_KEY, 3600);
    currentTime += 60 * 1000;
    const renewed = renewSession(original.id, 3600);

    expect(renewed).not.toBeNull();
    expect(renewed!.id).not.toBe(original.id);
    expect(renewed!.publicKey).toBe(PUBLIC_KEY);
    expect(renewed!.expiresAt).toBe(currentTime + 3600 * 1000);

    // Old session id is no longer valid; new one is.
    expect(getValidSession(original.id)).toBeNull();
    expect(getValidSession(renewed!.id)).toEqual(renewed);
  });

  test('renewSession returns null for an expired session', () => {
    const { createSession, renewSession } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);
    currentTime += 3601 * 1000;

    expect(renewSession(session.id)).toBeNull();
  });

  test('renewSession returns null for an already-revoked session', () => {
    const {
      createSession,
      revokeSession,
      renewSession,
    } = require('@/lib/sessionStore');

    const session = createSession(PUBLIC_KEY, 3600);
    revokeSession(session.id);

    expect(renewSession(session.id)).toBeNull();
  });

  test('renewSession returns null for an unknown id', () => {
    const { renewSession } = require('@/lib/sessionStore');

    expect(renewSession('does-not-exist')).toBeNull();
  });
});
