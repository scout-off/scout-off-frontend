import { NextRequest } from 'next/server';
import { getSessionWallet } from './session';

/**
 * Returns the admin's wallet address if `req`'s session cookie verifies
 * (see lib/session.ts) and matches the configured admin address, or null
 * otherwise. Same check every app/api/admin/* route already performs
 * inline (e.g. app/api/admin/academies/route.ts) — factored out here for
 * the new audit-log routes rather than duplicated again.
 *
 * Reads NEXT_PUBLIC_ADMIN_ADDRESS per call rather than caching it at module
 * load, unlike those inline copies — avoids depending on env-var-vs-import
 * ordering (relevant in tests that set it in beforeEach).
 */
export function requireAdminWallet(req: NextRequest): string | null {
  const wallet = getSessionWallet(req);
  if (!wallet || wallet !== process.env.NEXT_PUBLIC_ADMIN_ADDRESS) {
    return null;
  }
  return wallet;
}

/**
 * Multisig admin support (issue #1677).
 *
 * A multisig admin account has several signers with weights and medium/high
 * thresholds. Any wallet that is a signer on the admin account (not just the
 * single NEXT_PUBLIC_ADMIN_ADDRESS) may view and co-sign pending admin
 * transactions. This helper resolves the admin account's signers from Horizon
 * and checks whether `wallet` is one of them.
 *
 * Kept behind the ADMIN_MULTISIG_ENABLED feature flag until exercised on
 * testnet with a 2-of-3 setup, per the issue notes.
 */

export interface AdminSigner {
  key: string;
  weight: number;
}

export interface AdminAccountThresholds {
  low: number;
  medium: number;
  high: number;
}

export interface AdminAccountInfo {
  accountId: string;
  signers: AdminSigner[];
  thresholds: AdminAccountThresholds;
}

export function isMultisigEnabled(): boolean {
  return process.env.ADMIN_MULTISIG_ENABLED === 'true';
}

/**
 * Loads the admin account from Horizon and returns its signers + thresholds.
 * Returns null when the account cannot be loaded (e.g. not funded yet).
 */
export async function loadAdminAccount(
  horizonUrl: string = process.env.NEXT_PUBLIC_HORIZON_URL ??
    'https://horizon-testnet.stellar.org',
): Promise<AdminAccountInfo | null> {
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  if (!adminAddress) return null;

  const res = await fetch(`${horizonUrl}/accounts/${adminAddress}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    id: string;
    signers?: Array<{ key: string; weight: number }>;
    thresholds?: { low_threshold: number; med_threshold: number; high_threshold: number };
  };

  return {
    accountId: data.id,
    signers: (data.signers ?? []).map((s) => ({ key: s.key, weight: s.weight })),
    thresholds: {
      low: data.thresholds?.low_threshold ?? 0,
      medium: data.thresholds?.med_threshold ?? 0,
      high: data.thresholds?.high_threshold ?? 0,
    },
  };
}

/**
 * Returns the threshold weight required for an operation level. Admin
 * operations (add/remove validator, withdraw fees, pause/unpause) are
 * high-threshold operations.
 */
export function requiredThreshold(
  info: AdminAccountInfo,
  level: 'low' | 'medium' | 'high' = 'high',
): number {
  return info.thresholds[level];
}

/**
 * True when the admin account needs more than one signature for the given
 * operation level, i.e. no single signer's weight meets the threshold.
 */
export function requiresMultisig(
  info: AdminAccountInfo,
  level: 'low' | 'medium' | 'high' = 'high',
): boolean {
  const threshold = requiredThreshold(info, level);
  if (threshold <= 0) return false;
  return !info.signers.some((s) => s.weight >= threshold);
}

/**
 * Human-readable "requires N of M signatures" summary for the admin panel.
 * N is the minimum number of signers whose combined weight meets the
 * threshold; M is the total number of signers on the account.
 */
export function describeMultisigRequirement(
  info: AdminAccountInfo,
  level: 'low' | 'medium' | 'high' = 'high',
): { required: number; total: number; threshold: number; label: string } {
  const threshold = requiredThreshold(info, level);
  const signers = [...info.signers].sort((a, b) => b.weight - a.weight);
  let accumulated = 0;
  let required = 0;
  for (const signer of signers) {
    if (accumulated >= threshold) break;
    accumulated += signer.weight;
    required += 1;
  }
  const total = signers.length;
  return {
    required,
    total,
    threshold,
    label: `requires ${required} of ${total} signatures`,
  };
}

/**
 * Returns the wallet address if it is a signer on the admin account, or null
 * otherwise. Used by the pending-transaction routes to gate viewing/signing
 * to actual signers (issue #1677 auth requirement).
 */
export async function requireAdminSigner(
  req: NextRequest,
): Promise<{ wallet: string; account: AdminAccountInfo } | null> {
  const wallet = getSessionWallet(req);
  if (!wallet) return null;

  const account = await loadAdminAccount();
  if (!account) return null;

  const isSigner = account.signers.some((s) => s.key === wallet && s.weight > 0);
  if (!isSigner) return null;

  return { wallet, account };
}
