'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { getSafeReturnTo } from '@/lib/redirectReason';

/**
 * After useRequireWallet sends a user to the home page, return them to the
 * page they were trying to reach once the wallet connects and SEP-10 login
 * succeeds. Unsafe `returnTo` values are ignored (user stays on home).
 */
export default function ReturnToRedirect({
  returnTo,
}: {
  returnTo?: string | string[];
}) {
  const router = useRouter();
  const { isAuthenticated } = useWallet();

  useEffect(() => {
    if (!isAuthenticated) return;
    const target = getSafeReturnTo(returnTo, window.location.origin);
    if (target) router.replace(target);
  }, [isAuthenticated, returnTo, router]);

  return null;
}
