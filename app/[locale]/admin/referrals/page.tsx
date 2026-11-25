'use client';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import EmptyState from '@/components/ui/EmptyState';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import { getReferralOverview } from '@/lib/api';
import type { ReferralOverview } from '@/types';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

/** /admin/referrals — referral program totals and top referrers. */
export default function AdminReferralsPage() {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const { show } = useToast();
  const [referralOverview, setReferralOverview] =
    useState<ReferralOverview | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  useEffect(() => {
    setReferralLoading(true);
    getReferralOverview()
      .then(setReferralOverview)
      .catch(() =>
        show({
          message: t('referrals_page.load_failed'),
          variant: 'error',
        }),
      )
      .finally(() => setReferralLoading(false));
  }, [show, t]);

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('pages.referrals')}</h1>

      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">
          {t('referral_program')}
        </h2>
        {referralLoading ? (
          <p className="text-sm text-gray-400">{t('loading')}</p>
        ) : !referralOverview || referralOverview.totalCodes === 0 ? (
          <EmptyState
            title={t('no_referral_title')}
            description={t('no_referral_description')}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {t('codes_generated')}
                </p>
                <p className="text-2xl font-semibold text-white">
                  {formatNumber(referralOverview.totalCodes, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {t('successful_referrals')}
                </p>
                <p className="text-2xl font-semibold text-white">
                  {formatNumber(
                    referralOverview.totalSuccessfulReferrals,
                    locale,
                  )}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                {t('top_referrers')}
              </h3>
              <ul className="flex flex-col divide-y divide-gray-800">
                {referralOverview.topReferrers.map((r) => (
                  <li
                    key={r.scoutWallet}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="font-mono text-gray-300 truncate">
                      <TruncatedAddress
                        address={r.scoutWallet}
                        className="text-gray-300"
                      />
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {t('referrals_page.referrer_stats', {
                        referrals: r.successfulReferrals,
                        codes: r.totalCodes,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
