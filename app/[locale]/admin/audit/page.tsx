'use client';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

const AdminAuditLog = dynamic(
  () => import('@/components/admin/AdminAuditLog'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse h-48" />
    ),
  },
);

const ValidatorActionLog = dynamic(
  () => import('@/components/admin/ValidatorActionLog'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse h-48" />
    ),
  },
);

/** /admin/audit — admin and validator action logs. */
export default function AdminAuditPage() {
  const t = useTranslations('admin.pages');
  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t('audit')}</h1>
      <AdminAuditLog />
      <ValidatorActionLog />
    </div>
  );
}
