import { NextRequest } from 'next/server';
import { getSessionWallet } from './session';
import api from './api';
import type { Academy } from '@/types';

/**
 * Scoped academy-owner admin role (issue #1173).
 *
 * docs/academy-validator-model.md originally scoped roster management to
 * the single super-admin (`NEXT_PUBLIC_ADMIN_ADDRESS`, see lib/adminAuth.ts)
 * and explicitly flagged turning an academy's `ownerWallet` into a real
 * scoped-admin role as future work. This module adds that role as an
 * *additive* layer on top of the existing super-admin check — the
 * super-admin retains override capability over every academy's roster,
 * unchanged; an academy owner is authorized for their own academy/academies
 * only.
 *
 * This deliberately does not touch on-chain validator authorization (see
 * the doc's "on-chain stays untouched" section) — it's purely about who may
 * edit the off-chain roster label via app/api/admin/academies/**.
 */

export type AcademyRole =
  | { role: 'super-admin'; wallet: string }
  | {
      role: 'academy-owner';
      wallet: string;
      academyIds: string[];
      academies: Academy[];
    };

/**
 * Resolves the connected/authenticated wallet's role: super-admin (matches
 * NEXT_PUBLIC_ADMIN_ADDRESS), academy-owner (recorded as `ownerWallet` on
 * one or more academies), or null (no session, or neither). A failure to
 * reach the backend academy-owner lookup fails closed — treated as "no
 * role" rather than granting access, unlike the enrichment-only
 * `fetchAcademyForWallet` lookup in lib/api.ts which fails open.
 */
export async function resolveAcademyRole(
  req: NextRequest,
): Promise<AcademyRole | null> {
  const wallet = getSessionWallet(req);
  if (!wallet) return null;

  if (wallet === process.env.NEXT_PUBLIC_ADMIN_ADDRESS) {
    return { role: 'super-admin', wallet };
  }

  try {
    const academies: Academy[] = await api
      .get(`/academies/owner/${encodeURIComponent(wallet)}`)
      .then((r) => r.data);
    if (Array.isArray(academies) && academies.length > 0) {
      return {
        role: 'academy-owner',
        wallet,
        academyIds: academies.map((a) => a.id),
        academies,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Authorizes the caller to manage `academyId`'s roster: the super-admin may
 * manage any academy; an academy-owner only one(s) they own. Returns the
 * resolved role on success, or null when the caller has no session, is
 * neither a super-admin nor an owner, or is an owner of a *different*
 * academy than `academyId` — the case the acceptance criteria calls out
 * ("an academy owner cannot view or modify any other academy's roster").
 */
export async function requireAcademyManager(
  req: NextRequest,
  academyId: string,
): Promise<AcademyRole | null> {
  const role = await resolveAcademyRole(req);
  if (!role) return null;
  if (role.role === 'super-admin') return role;
  return role.academyIds.includes(academyId) ? role : null;
}
