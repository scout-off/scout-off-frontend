import { Keypair } from '@stellar/stellar-sdk';

/**
 * The e2e admin wallet. playwright.config.ts boots the dev server with
 * NEXT_PUBLIC_ADMIN_ADDRESS set to this key's public half, so a spec that
 * signs in with E2E_ADMIN_SECRET passes the /admin guard
 * (components/admin/AdminShell.tsx) and lib/adminAuth.ts. Test-only key.
 */
export const E2E_ADMIN_SECRET =
  process.env.E2E_ADMIN_SECRET ||
  'SAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC5MY';

export const E2E_ADMIN_ADDRESS =
  Keypair.fromSecret(E2E_ADMIN_SECRET).publicKey();
