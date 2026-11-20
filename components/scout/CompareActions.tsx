'use client';

import { useTranslations } from 'next-intl';
import { Download, Link2 } from 'lucide-react';
import type { Player } from '@/types';
import { buildCompareCsv } from '@/lib/playerCompare';
import { useToast } from '@/components/ui/Toast';

interface CompareActionsProps {
  players: Player[];
}

/** "Copy link" and "Download CSV" for the current comparison (issue #1721). */
export default function CompareActions({ players }: CompareActionsProps) {
  const t = useTranslations('scout.compare');
  const ts = useTranslations('stats');
  const { show } = useToast();

  const handleCopyLink = async () => {
    const url = new URL(window.location.href);
    const canonical = `${url.origin}${url.pathname}?ids=${players
      .map((p) => encodeURIComponent(p.id))
      .join(',')}`;
    try {
      await navigator.clipboard.writeText(canonical);
      show({ message: t('link_copied'), variant: 'success' });
    } catch {
      // Clipboard API unavailable or denied: surface the link so it can be
      // copied by hand.
      show({
        message: t('link_copy_failed', { url: canonical }),
        variant: 'error',
      });
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildCompareCsv(players, {
      name: t('name'),
      age: t('age'),
      position: t('position'),
      region: t('region'),
      nationality: t('nationality'),
      progressLevel: t('progress'),
      goals: ts('goals'),
      assists: ts('assists'),
      appearances: ts('appearances'),
      clean_sheets: ts('clean_sheets'),
      milestones: t('milestones'),
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `player-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const buttonClass =
    'inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 transition';

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={handleCopyLink} className={buttonClass}>
        <Link2 className="w-4 h-4" aria-hidden="true" />
        {t('copy_link')}
      </button>
      <button type="button" onClick={handleDownloadCsv} className={buttonClass}>
        <Download className="w-4 h-4" aria-hidden="true" />
        {t('download_csv')}
      </button>
    </div>
  );
}
