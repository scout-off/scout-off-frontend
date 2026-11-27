/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  describeMultisigRequirement,
  isMultisigEnabled,
  requireAdminWallet,
  requiresMultisig,
  type AdminAccountInfo,
} from '@/lib/adminAuth';
import { createSessionToken } from '@/lib/session';
import { SessionStore } from '@/lib/sessionStore';

const ADMIN_ADDRESS = 'GADMINADDRESS000000000000000000000000000000000000000000';
const NON_ADMIN_ADDRESS =
  'GUSERADDRESS0000000000000000000000000000000000000000000';

/** Builds a request carrying a real, store-backed session for `wallet`. */
function makeRequest(wallet?: string): NextRequest {
  const headers = new Headers();
  if (wallet !== undefined) {
    const sid = `sid-${Math.random()}`;
    SessionStore.getInstance().create(sid, wallet, Date.now() + 60_000);
    headers.set(
      'cookie',
      `session=${createSessionToken(wallet, 'access', 20 * 60, { sid })}`,
    );
  }
  return new NextRequest('http://localhost/api/admin/test', { headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  SessionStore.resetInstance();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  SessionStore.resetInstance();
});

describe('requireAdminWallet', () => {
  it('returns the wallet when the session matches the admin address', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(requireAdminWallet(makeRequest(ADMIN_ADDRESS))).toBe(ADMIN_ADDRESS);
  });

  it('returns null when there is no session cookie', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(requireAdminWallet(makeRequest())).toBeNull();
  });

  it('returns null when the session is for a non-admin wallet', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(requireAdminWallet(makeRequest(NON_ADMIN_ADDRESS))).toBeNull();
  });

  it('rejects a forged, unsigned cookie carrying the admin address', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    const req = new NextRequest('http://localhost/api/admin/test', {
      headers: { cookie: `session=${ADMIN_ADDRESS}` },
    });
    expect(requireAdminWallet(req)).toBeNull();
  });

  it('fails closed when NEXT_PUBLIC_ADMIN_ADDRESS is unset', () => {
    delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    expect(requireAdminWallet(makeRequest(ADMIN_ADDRESS))).toBeNull();
    expect(requireAdminWallet(makeRequest())).toBeNull();
  });
});

describe('multisig helpers', () => {
  const account = (weights: number[], high: number): AdminAccountInfo => ({
    accountId: ADMIN_ADDRESS,
    signers: weights.map((weight, i) => ({ key: `G${i}`, weight })),
    thresholds: { low: 1, medium: 1, high },
  });

  it('isMultisigEnabled follows the ADMIN_MULTISIG_ENABLED flag', () => {
    delete process.env.ADMIN_MULTISIG_ENABLED;
    expect(isMultisigEnabled()).toBe(false);
    process.env.ADMIN_MULTISIG_ENABLED = 'true';
    expect(isMultisigEnabled()).toBe(true);
  });

  it('requiresMultisig is true only when no single signer meets the threshold', () => {
    expect(requiresMultisig(account([1, 1, 1], 2))).toBe(true);
    expect(requiresMultisig(account([2, 1], 2))).toBe(false);
    expect(requiresMultisig(account([1], 0))).toBe(false);
  });

  it('describeMultisigRequirement reports the minimum signer count', () => {
    expect(describeMultisigRequirement(account([1, 1, 1], 2))).toEqual({
      required: 2,
      total: 3,
      threshold: 2,
      label: 'requires 2 of 3 signatures',
    });
  });
});
