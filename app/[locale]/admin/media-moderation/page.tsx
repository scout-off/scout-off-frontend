'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getMediaProxyUrl } from '@/lib/mediaUrl';
import {
  type MediaDenylistEntry,
  type MediaModerationQueueItem,
  type MediaReportReason,
} from '@/lib/mediaModeration';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

type Decision = 'approve' | 'deny' | 'reinstate';

/** Blurred by default so moderators aren't exposed to abusive media until they choose to look. */
function BlurredPreview({ cid }: { cid: string }) {
  const t = useTranslations('admin.media_moderation');
  const [revealed, setRevealed] = useState(false);
  const isVideo = cid.endsWith('.mp4') || cid.endsWith('.webm');
  const src = getMediaProxyUrl(cid);
  const mediaClass = `h-full w-full object-cover transition ${revealed ? '' : 'blur-xl'}`;

  return (
    <div className="relative aspect-square w-40 shrink-0 overflow-hidden rounded-lg bg-gray-800">
      {isVideo ? (
        <video src={src} className={mediaClass} controls={revealed} muted />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={t('reported_media_alt', { cid })}
          className={mediaClass}
        />
      )}
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white"
      >
        {revealed ? t('blur') : t('reveal')}
      </button>
    </div>
  );
}

function MediaModerationContent() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.media_moderation');
  const tAdmin = useTranslations('admin');
  const tReasons = useTranslations('player_profile.media_report.reasons');
  const { publicKey } = useWallet();
  const router = useRouter();
  const { show } = useToast();
  const [queue, setQueue] = useState<MediaModerationQueueItem[]>([]);
  const [denylist, setDenylist] = useState<MediaDenylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [unpin, setUnpin] = useState<Record<string, boolean>>({});
  const [busyCid, setBusyCid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/media-moderation', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQueue(data.queue);
      setDenylist(data.denylist);
    } catch (err) {
      show({
        message: t('load_failed', {
          error: err instanceof Error ? err.message : 'error',
        }),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [show, t]);

  // Gate: redirect non-admin wallets, mirroring app/[locale]/admin/page.tsx.
  useEffect(() => {
    if (!publicKey) return;
    if (publicKey !== ADMIN_ADDRESS) {
      show({
        message: tAdmin('unauthorized_message'),
        variant: 'error',
      });
      router.replace('/');
    }
  }, [publicKey, router, show, tAdmin]);

  useEffect(() => {
    if (publicKey === ADMIN_ADDRESS) load();
  }, [publicKey, load]);

  async function decide(
    cid: string,
    decision: Decision,
    playerId: string | null = null,
  ) {
    setBusyCid(cid);
    try {
      const res = await fetch('/api/admin/media-moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid,
          decision,
          playerId,
          reason: reasons[cid] ?? '',
          unpin: unpin[cid] ?? false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      show({
        message: t('decision_success', { decision }),
        variant: 'success',
      });
      await load();
    } catch (err) {
      show({
        message: err instanceof Error ? err.message : t('decision_failed'),
        variant: 'error',
      });
    } finally {
      setBusyCid(null);
    }
  }

  if (!publicKey || publicKey !== ADMIN_ADDRESS) return null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400">{t('description')}</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">
          {loading
            ? t('pending_reports')
            : t('pending_reports_count', { count: queue.length })}
        </h2>
        {!loading && queue.length === 0 && (
          <p className="text-sm text-gray-400">{t('empty')}</p>
        )}
        {queue.map((item) => (
          <article
            key={item.cid}
            className="flex flex-col gap-4 rounded-xl border border-gray-800 bg-brand-card p-4 sm:flex-row"
          >
            <BlurredPreview cid={item.cid} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              <p className="break-all font-mono text-xs text-gray-400">
                {item.cid}
              </p>
              <p className="text-white">
                {t('report_count', { count: item.reportCount })}{' '}
                {Object.entries(item.reasons)
                  .map(([r, n]) => `${tReasons(r as MediaReportReason)} (${n})`)
                  .join(', ')}
              </p>
              {item.playerId && (
                <Link
                  href={`/player/${encodeURIComponent(item.playerId)}`}
                  className="text-brand-green underline"
                >
                  {t('view_player', { id: item.playerId })}
                </Link>
              )}
              {item.details.length > 0 && (
                <ul className="list-disc pl-5 text-gray-300">
                  {item.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <input
                type="text"
                placeholder={t('reason_placeholder')}
                aria-label={t('reason_aria', { cid: item.cid })}
                value={reasons[item.cid] ?? ''}
                onChange={(e) =>
                  setReasons((r) => ({ ...r, [item.cid]: e.target.value }))
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-white"
              />
              <label className="flex items-center gap-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={unpin[item.cid] ?? false}
                  onChange={(e) =>
                    setUnpin((u) => ({ ...u, [item.cid]: e.target.checked }))
                  }
                />
                {t('unpin')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyCid === item.cid}
                  onClick={() => decide(item.cid, 'approve', item.playerId)}
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  type="button"
                  disabled={busyCid === item.cid || !reasons[item.cid]?.trim()}
                  onClick={() => decide(item.cid, 'deny', item.playerId)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {t('deny')}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">
          {t('denylist', { count: denylist.length })}
        </h2>
        {denylist.map((entry) => (
          <div
            key={entry.cid}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="break-all font-mono text-xs text-gray-400">
                {entry.cid}
              </p>
              <p className="text-gray-300">
                {entry.reason} —{' '}
                {formatDateTime(new Date(entry.decidedAt), locale)}
              </p>
            </div>
            <button
              type="button"
              disabled={busyCid === entry.cid}
              onClick={() => decide(entry.cid, 'reinstate')}
              className="rounded-lg border border-gray-600 px-3 py-1.5 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {t('reinstate')}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function MediaModerationPage() {
  return (
    <ErrorBoundary>
      <MediaModerationContent />
    </ErrorBoundary>
  );
}
