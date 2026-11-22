'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@/hooks/useWallet';
import TransactionStatus from '@/components/ui/TransactionStatus';
import type { TxStatus } from '@/components/ui/TransactionStatus';
import XlmFiatDisplay from '@/components/ui/XlmFiatDisplay';
import { recordAuditEntry } from '@/lib/adminAuditClient';
import { buildWithdrawFees, getPlatformFees } from '@/lib/contract';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/lib/locales';
import { formatXlmAmount } from '@/lib/localeFormat';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { useAdminConfirm } from '@/components/admin/useAdminConfirm';
import { useAdminContractState } from '@/hooks/useAdminContractState';

const AdminDashboardSkeleton = dynamic(
  () => import('@/components/admin/AdminDashboardSkeleton'),
  { ssr: false },
);
const FeeRevenueChart = dynamic(
  () => import('@/components/admin/FeeRevenueChart'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse h-64" />
    ),
  },
);

/** /admin/fees — accumulated platform fees, withdrawal and fee revenue. */
export default function AdminFeesPage() {
  const { publicKey, signAndSubmit } = useWallet();
  const { fees, setFees, paused, loading, fetchError, reload } =
    useAdminContractState();
  const { confirm, dialog } = useAdminConfirm();
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;

  const [withdrawTxStatus, setWithdrawTxStatus] = useState<TxStatus | null>(
    null,
  );
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);

  function withdraw() {
    if (!publicKey) return;
    confirm({
      label: t('withdraw_fees'),
      message: t('withdraw_confirm', {
        amount: formatXlmAmount(fees ?? 0, locale),
      }),
      run: async () => {
        const amountStroops = fees ?? undefined;
        const xdr = await buildWithdrawFees(publicKey);
        setWithdrawTxStatus('pending');
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'fee_withdrawal',
          amountStroops,
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setWithdrawTxHash(txHash);
        setWithdrawTxStatus('success');
        setFees((await getPlatformFees()) as number);
      },
      onError: () => setWithdrawTxStatus('error'),
    });
  }

  if (loading) return <AdminDashboardSkeleton />;
  if (fetchError) return <AdminLoadError onRetry={reload} />;

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('pages.fees')}</h1>

      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">
          {t('platform_fees')}
        </h2>
        <p className="text-sm text-gray-400">
          {t('fees.accumulated_label')} <XlmFiatDisplay xlmAmount={fees ?? 0} />
        </p>
        <button
          disabled={!fees || fees <= 0 || paused}
          onClick={withdraw}
          title={paused ? t('contract_paused_hint') : undefined}
          className="w-fit px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
        >
          {t('withdraw_fees')}
        </button>
        <TransactionStatus
          status={withdrawTxStatus}
          txHash={withdrawTxHash}
          onHide={() => {
            setWithdrawTxStatus(null);
            setWithdrawTxHash(null);
          }}
        />
      </section>

      <FeeRevenueChart />

      {dialog}
    </div>
  );
}
