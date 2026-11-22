'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { sanitizeReturnTo } from '@/lib/redirectReason';

interface WalletReturnRedirectProps {
  /** Raw `returnTo` query param from the wallet-required redirect. */
  returnTo?: string | string[] | null;
}

/**
 * After useRequireWallet sends a user home, return them to the page they
 * were trying to reach once the wallet connects and SEP-10 login succeeds
 * (#1696). Unsafe values are ignored and the user stays on the home page.
 */
export default function WalletReturnRedirect({
  returnTo,
}: WalletReturnRedirectProps) {
  const { isAuthenticated } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    const target = sanitizeReturnTo(returnTo, window.location.origin);
    if (target) router.replace(target);
  }, [isAuthenticated, returnTo, router]);

  return null;
}
