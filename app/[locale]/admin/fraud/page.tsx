'use client';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

const FraudFlagsPanel = dynamic(
  () => import('@/components/admin/FraudFlagsPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse h-20" />
    ),
  },
);

/** /admin/fraud — flagged activity. */
export default function AdminFraudPage() {
  const t = useTranslations('admin.pages');
  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('fraud')}</h1>
      <FraudFlagsPanel />
    </div>
  );
}
