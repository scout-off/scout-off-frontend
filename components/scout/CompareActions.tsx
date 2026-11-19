'use client';

import { useTranslations } from 'next-intl';
import { Download, Link2 } from 'lucide-react';
import type { Player } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { buildCompareCsv } from '@/lib/playerCompare';

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Canonical comparison URL: current path with only the `ids` param. */
export function buildCompareUrl(players: readonly Player[]): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('ids', players.map((p) => p.id).join(','));
  return url.toString().replace(/%2C/g, ',');
}

export default function CompareActions({ players }: { players: Player[] }) {
  const t = useTranslations('scout.compare');
  const ts = useTranslations('stats');
  const { show } = useToast();

  const handleCopy = async () => {
    const link = buildCompareUrl(players);
    try {
      await navigator.clipboard.writeText(link);
      show({ message: t('link_copied'), variant: 'success' });
    } catch {
      // Clipboard unavailable (insecure context / denied): show the link.
      show({
        message: t('link_copy_failed', { url: link }),
        variant: 'warning',
        duration: 10000,
      });
    }
  };

  const handleCsv = () => {
    const csv = buildCompareCsv(players, {
      attribute: t('attribute'),
      age: t('age'),
      position: t('position'),
      region: t('region'),
      nationality: t('nationality'),
      milestones: t('milestones'),
      goals: ts('goals'),
      assists: ts('assists'),
      appearances: ts('appearances'),
      clean_sheets: ts('clean_sheets'),
      progressLevel: t('progress'),
    });
    downloadCsv(csv, 'player-comparison.csv');
    show({ message: t('csv_downloaded'), variant: 'success' });
  };

  const buttonClass =
    'inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:border-brand-green hover:text-white transition disabled:opacity-50';

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={buttonClass}
        disabled={players.length === 0}
      >
        <Link2 size={14} aria-hidden="true" />
        {t('copy_link')}
      </button>
      <button
        type="button"
        onClick={handleCsv}
        className={buttonClass}
        disabled={players.length === 0}
      >
        <Download size={14} aria-hidden="true" />
        {t('download_csv')}
      </button>
    </div>
  );
}
