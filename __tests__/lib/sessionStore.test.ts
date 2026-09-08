/**
 * @jest-environment node
 */
import { SessionStore } from '@/lib/sessionStore';

let store: SessionStore;

beforeEach(() => {
  SessionStore.resetInstance();
  store = SessionStore.getInstance();
});

afterEach(() => {
  SessionStore.resetInstance();
});

describe('SessionStore', () => {
  it('is a singleton', () => {
    const a = SessionStore.getInstance();
    const b = SessionStore.getInstance();
    expect(a).toBe(b);
  });

  it('a freshly-created session is active', () => {
    store.create('sid-1', 'GWALLET', Date.now() + 60_000);
    expect(store.isActive('sid-1')).toBe(true);
  });

  it('an unknown session id is not active', () => {
    expect(store.isActive('sid-does-not-exist')).toBe(false);
  });

  it('a session past its stored expiry is not active', () => {
    store.create('sid-expired', 'GWALLET', Date.now() - 1);
    expect(store.isActive('sid-expired')).toBe(false);
  });

  it('revoke() flags a session inactive and returns true', () => {
    store.create('sid-2', 'GWALLET', Date.now() + 60_000);
    expect(store.revoke('sid-2')).toBe(true);
    expect(store.isActive('sid-2')).toBe(false);
  });

  it('revoke() returns false for an unknown or already-revoked session', () => {
    expect(store.revoke('sid-nonexistent')).toBe(false);

    store.create('sid-3', 'GWALLET', Date.now() + 60_000);
    expect(store.revoke('sid-3')).toBe(true);
    expect(store.revoke('sid-3')).toBe(false);
  });

  it("touch() extends an active session's expiry", () => {
    store.create('sid-4', 'GWALLET', Date.now() + 1);
    store.touch('sid-4', Date.now() + 60_000);
    expect(store.isActive('sid-4')).toBe(true);
  });

  it('touch() does not revive a revoked session', () => {
    store.create('sid-5', 'GWALLET', Date.now() + 60_000);
    store.revoke('sid-5');
    store.touch('sid-5', Date.now() + 60_000);
    expect(store.isActive('sid-5')).toBe(false);
  });

  it('revokeAllForWallet() revokes every active session for that wallet only', () => {
    store.create('sid-a1', 'GWALLET_A', Date.now() + 60_000);
    store.create('sid-a2', 'GWALLET_A', Date.now() + 60_000);
    store.create('sid-b1', 'GWALLET_B', Date.now() + 60_000);

    const revoked = store.revokeAllForWallet('GWALLET_A');

    expect(revoked).toBe(2);
    expect(store.isActive('sid-a1')).toBe(false);
    expect(store.isActive('sid-a2')).toBe(false);
    expect(store.isActive('sid-b1')).toBe(true);
  });

  it('revokeAllForWallet() is idempotent (a second call revokes nothing new)', () => {
    store.create('sid-6', 'GWALLET', Date.now() + 60_000);
    expect(store.revokeAllForWallet('GWALLET')).toBe(1);
    expect(store.revokeAllForWallet('GWALLET')).toBe(0);
  });

  it('listForWallet() returns every row (active and revoked) for that wallet', () => {
    store.create('sid-7', 'GWALLET', Date.now() + 60_000, 'ua-1');
    store.create('sid-8', 'GWALLET', Date.now() + 60_000, 'ua-2');
    store.revoke('sid-7');

    const rows = store.listForWallet('GWALLET');
    expect(rows.map((r) => r.id).sort()).toEqual(['sid-7', 'sid-8']);
    expect(rows.find((r) => r.id === 'sid-7')?.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.id === 'sid-8')?.revokedAt).toBeNull();
    expect(rows.find((r) => r.id === 'sid-7')?.userAgent).toBe('ua-1');
  });
});
