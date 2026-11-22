import { useTranslations } from 'next-intl';

export default function AdminLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('admin');
  return (
    <div className="max-w-3xl mx-auto mt-20 flex flex-col items-center gap-4 text-center">
      <p className="text-gray-400">{t('recovery_failed')}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition"
      >
        {t('retry')}
      </button>
    </div>
  );
}
