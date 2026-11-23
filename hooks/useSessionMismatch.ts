'use client';

import { useWallet } from '@/hooks/useWallet';

/**
 * Returns whether the currently-connected wallet address differs from the
 * identity the session cookie actually authenticated.
 *
 * This can happen when a user switches accounts in their wallet extension
 * without explicitly disconnecting and re-authenticating first. If this
 * mismatch is true, the user should re-authenticate to ensure they're
 * operating under the correct identity.
 */
export function useSessionMismatch() {
  const { sessionMismatch } = useWallet();
  return sessionMismatch;
}
