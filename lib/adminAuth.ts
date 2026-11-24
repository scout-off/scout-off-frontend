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
