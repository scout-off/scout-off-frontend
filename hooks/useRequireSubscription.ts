'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useSubscription } from './useSubscription';
import { useToast } from '@/components/ui/Toast';
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
      // Also pass the reason via query param — the toast above can be missed
      // if the redirect fires before it renders, but this survives the
      // navigation so the destination page can show a persistent explanation.
      router.replace(`/${locale}/scout/subscribe?reason=subscription-expired`);
    }
  }, [subscription, isExpired, loading, publicKey, router, locale, show]);

  return { isProtected: !!subscription && !isExpired, loading };
}
