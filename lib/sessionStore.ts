import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'sessions.json');

export const DEFAULT_SESSION_TTL_SECONDS = (() => {
  const configured = Number(process.env.SESSION_MAX_AGE_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 24 * 60 * 60; // 24 hours
})();

export interface SessionRecord {
  id: string;
  publicKey: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

interface StoreData {
  sessions: SessionRecord[];
}

function readStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) return { sessions: [] };
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { sessions: [] };
  }
}

function writeStore(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** Drops expired sessions so the store doesn't grow unbounded. */
function pruneExpired(store: StoreData, now: number): StoreData {
  return { sessions: store.sessions.filter((s) => s.expiresAt > now) };
}

export function createSession(
  publicKey: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
): SessionRecord {
  const now = Date.now();
  const store = pruneExpired(readStore(), now);

  const session: SessionRecord = {
    id: crypto.randomUUID(),
    publicKey,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
    revoked: false,
  };
  store.sessions.push(session);
  writeStore(store);
  return session;
}

/** Returns the session record only if it exists, is unexpired, and unrevoked. */
export function getValidSession(id: string): SessionRecord | null {
  const now = Date.now();
  const store = readStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return null;
  if (session.revoked || session.expiresAt <= now) return null;
  return session;
}

/** Marks a session as revoked so it can no longer authenticate. */
export function revokeSession(id: string): void {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return;
  session.revoked = true;
  writeStore(store);
}

/**
 * Rotates a valid session: revokes the old id and issues a fresh one for the
 * same public key with a renewed expiry. Returns null if the given id is not
 * currently valid (expired, revoked, or unknown).
 */
export function renewSession(
  id: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
): SessionRecord | null {
  const now = Date.now();
  const store = pruneExpired(readStore(), now);
  const session = store.sessions.find((s) => s.id === id);
  if (!session || session.revoked || session.expiresAt <= now) return null;

  session.revoked = true;

  const renewed: SessionRecord = {
    id: crypto.randomUUID(),
    publicKey: session.publicKey,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
    revoked: false,
  };
  store.sessions.push(renewed);
  writeStore(store);
  return renewed;
}
