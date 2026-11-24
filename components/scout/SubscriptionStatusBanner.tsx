'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Subscription } from '@/types';

/** Scout subscription tier and days remaining, with a renew link when expiring. */
export default function SubscriptionStatusBanner({
  subscription,
}: {
  subscription: Subscription;
}) {
  const t = useTranslations('subscription_status_banner');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const daysRemaining = Math.floor(
    (subscription.expiresAt - now / 1000) / 86400,
  );
  const tierLabel =
    subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1);

  if (daysRemaining <= 0) {
    return (
      <div
        data-tour="subscription-status"
        className="flex items-center gap-3 rounded-xl border border-red-500 bg-brand-card px-4 py-3 text-sm"
      >
        <span className="text-red-400">{t('expired')}</span>
        <Link
          href="/scout/subscribe"
          className="ml-auto text-brand-green underline hover:opacity-80 transition"
        >
          {t('renew')}
        </Link>
      </div>
    );
  }

  if (daysRemaining <= 7) {
    return (
      <div
        data-tour="subscription-status"
        className="flex items-center gap-3 rounded-xl border border-orange-400 bg-brand-card px-4 py-3 text-sm text-gray-200"
      >
        <span>
          {t('expires_in', { tier: tierLabel, count: daysRemaining })}
        </span>
        <Link
          href="/scout/subscribe"
          className="ml-auto text-brand-green underline hover:opacity-80 transition"
        >
          {t('renew')}
        </Link>
      </div>
    );
  }

  return (
    <div
      data-tour="subscription-status"
      className="flex items-center gap-3 rounded-xl border border-brand-green bg-brand-card px-4 py-3 text-sm text-gray-200"
    >
      {t('days_remaining', { tier: tierLabel, count: daysRemaining })}
    </div>
  );
}
