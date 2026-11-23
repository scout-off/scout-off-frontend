'use client';

import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/components/ui/Toast';

/** Issue #558: explicit opt-in/out for milestone-approval push notifications. */
export default function PushNotificationToggle() {
  const { publicKey } = useWallet();
  const { status, enable, disable } = usePushNotifications(publicKey ?? null);
  const { show } = useToast();
  const t = useTranslations('notifications.push');

  if (status === 'unsupported') {
    return <p className="text-sm text-gray-400">{t('unsupported')}</p>;
  }

  if (status === 'denied') {
    return <p className="text-sm text-gray-400">{t('denied')}</p>;
  }

  const subscribed = status === 'subscribed';

  const handleClick = async () => {
    try {
      if (subscribed) {
        await disable();
        show({ message: t('turned_off'), variant: 'info' });
      } else {
        await enable();
      }
    } catch (err) {
      show({ message: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-200">{t('title')}</p>
        <p className="text-xs text-gray-400">{t('description')}</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading' || !publicKey}
        aria-pressed={subscribed}
        className="shrink-0 px-4 py-1.5 rounded-lg border border-brand-green text-sm text-brand-green disabled:opacity-40 hover:bg-brand-green hover:text-black transition"
      >
        {subscribed ? t('turn_off') : t('enable')}
      </button>
    </div>
  );
}
