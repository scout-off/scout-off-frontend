import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { WatchlistEntry } from '@/types';

/** First five watchlisted players on the scout dashboard; renders nothing when empty. */
export default function WatchlistPreview({
  entries,
  onRemove,
}: {
  entries: WatchlistEntry[];
  onRemove: (entry: WatchlistEntry) => void;
}) {
  const t = useTranslations('scout_dashboard.watchlist_preview');
  if (entries.length === 0) return null;
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">{t('title')}</h2>
        <Link
          href="/scout/watchlist"
          className="text-xs text-brand-green hover:underline"
        >
          {t('view_all')}
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.slice(0, 5).map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 text-sm text-gray-200"
          >
            <Link
              href={`/player/${entry.playerId}`}
              className="text-brand-green hover:underline truncate"
            >
              {entry.playerId}
            </Link>
            <button
              type="button"
              onClick={() => onRemove(entry)}
              aria-label={t('remove_aria', { playerId: entry.playerId })}
              className="px-3 py-1 rounded-lg border border-gray-700 text-xs text-gray-300 hover:border-red-500 hover:text-red-400 transition"
            >
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
