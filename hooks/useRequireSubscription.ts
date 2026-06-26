'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useSubscription } from './useSubscription';
import { useToast } from './useToast';
import { useWallet } from './useWallet';

export function useRequireSubscription() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const locale = useLocale();
  const { show } = useToast();
  const { subscription, isExpired, loading } = useSubscription();

  useEffect(() => {
    // Wait for subscription to load before checking
    if (loading) return;

    // No wallet connected, will be handled by useRequireWallet
    if (!publicKey) return;

    // No subscription or subscription is expired
    if (!subscription || isExpired) {
      show({
        message: 'Your subscription has expired — please renew to continue.',
        variant: 'warning',
      });
      router.replace(`/${locale}/scout/subscribe`);
    }
  }, [subscription, isExpired, loading, publicKey, router, locale, show]);

  return { isProtected: !!subscription && !isExpired, loading };
}
