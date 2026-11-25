'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useWallet } from './useWallet';

export function useRequireWallet() {
  const { publicKey, isAuthenticated, isConnecting, isRestoringSession } =
    useWallet();
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Don't redirect while session is being restored from the server — this
    // prevents a flash-redirect for users who are already authenticated.
    if (isRestoringSession) return;
    if (!isConnecting && !isAuthenticated) {
      const query = searchParams?.toString();
      const returnTo = `${pathname ?? '/'}${query ? `?${query}` : ''}`;
      router.replace(
        `/${locale}/?reason=wallet-required&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
  }, [
    publicKey,
    isAuthenticated,
    isConnecting,
    isRestoringSession,
    router,
    locale,
    pathname,
    searchParams,
  ]);

  return { walletAddress: publicKey };
}
