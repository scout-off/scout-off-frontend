'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DataTable from '@/components/ui/DataTable';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate as formatLocaleDate } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

interface AutomatedModerationEntry {
  id: string;
  category: string;
  rule: string;
  severity: 'low' | 'medium' | 'high';
  userId: string;
  threadId?: string;
  timestamp: number;
  context: Record<string, unknown>;
}

interface AuditEntry {
  id: number;
  actionType: string;
  adminWallet: string;
  target: string | null;
  amountStroops: number | null;
  txHash: string | null;
  status: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export default function AutomatedModerationLog() {
  const t = useTranslations('admin.auto_moderation');
  const tSeverity = useTranslations('admin.severity');
  const tLogs = useTranslations('admin.logs');
  const locale = useLocale() as Locale;
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>(
    'all',
  );
  const [filterUserId, setFilterUserId] = useState('');
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  // The userId filter is applied server-side so it covers every matching
  // entry, not just the latest page; `before` fetches the next page.
  const fetchPage = async (before?: number) => {
    const params = new URLSearchParams();
    const userId = filterUserId.trim();
    if (userId) params.set('userId', userId);
    if (before !== undefined) params.set('before', String(before));
    const query = params.toString();
    const res = await fetch(
      `/api/admin/automated-moderation-log${query ? `?${query}` : ''}`,
    );
    if (!res.ok) throw new Error(t('load_failed'));
    return (await res.json()) as {
      entries?: AuditEntry[];
      nextCursor?: number | null;
    };
  };

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPage();
      setEntries(data.entries ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (nextCursor === null) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchPage(nextCursor);
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('load_failed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredEntries = entries.filter((entry) => {
    if (filter !== 'all') {
      // Extract severity from the data field
      const severity = entry.data?.severity as string | undefined;
      if (severity !== filter) return false;
    }

    return true;
  });

  const getSeverityLabel = (severity: string | undefined): string => {
    switch (severity) {
      case 'high':
      case 'medium':
      case 'low':
        return tSeverity(severity);
      default:
        return tSeverity('unknown');
    }
  };

  const getSeverityColor = (severity: string | undefined): string => {
    switch (severity) {
      case 'high':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low':
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default:
        return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
    }
  };

  const formatDate = (timestamp: number): string => {
    return formatLocaleDate(timestamp * 1000, locale, {
      dateStyle: undefined,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
        <span className="text-sm text-gray-400">
          {t('entries', { count: entries.length })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="moderation-filter-severity"
            className="text-sm text-gray-400"
          >
            {t('filter_severity')}
          </label>
          <select
            id="moderation-filter-severity"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-green"
          >
            <option value="all">{tLogs('all')}</option>
            <option value="high">{tSeverity('high')}</option>
            <option value="medium">{tSeverity('medium')}</option>
            <option value="low">{tSeverity('low')}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="moderation-filter-user"
            className="text-sm text-gray-400"
          >
            {t('filter_user')}
          </label>
          <input
            id="moderation-filter-user"
            type="text"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadEntries();
            }}
            placeholder={t('user_placeholder')}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-green w-48"
          />
        </div>

        <button
          onClick={loadEntries}
          className="px-3 py-1.5 rounded-lg bg-brand-green text-black text-sm font-medium hover:opacity-90 transition"
        >
          {t('refresh')}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">{t('loading')}</p>}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && filteredEntries.length === 0 && (
        <p className="text-sm text-gray-400">{t('empty')}</p>
      )}

      {!loading && !error && filteredEntries.length > 0 && (
        <DataTable
          caption="Automated moderation entries"
          captionHidden
          className="w-full text-left text-sm"
          headerRowClassName="border-b border-gray-700 text-gray-400"
          bodyClassName=""
          rowClassName="border-b border-gray-700/50 hover:bg-gray-800/50"
          rows={filteredEntries}
          rowKey={(entry) => entry.id}
          columns={[
            {
              key: 'timestamp',
              header: tLogs('time'),
              headerClassName: 'py-2 pr-4 font-medium',
              className: 'py-2 pr-4 text-gray-300',
              render: (entry) => formatDate(entry.timestamp),
            },
            {
              key: 'severity',
              header: t('severity'),
              headerClassName: 'py-2 pr-4 font-medium',
              render: (entry) => {
                const severity = entry.data?.severity as string | undefined;
                return (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(severity)}`}
                  >
                    {getSeverityLabel(severity)}
                  </span>
                );
              },
            },
            {
              key: 'rule',
              header: t('rule'),
              headerClassName: 'py-2 pr-4 font-medium',
              className: 'py-2 pr-4 text-gray-200 font-medium',
              render: (entry) =>
                (entry.data?.rule as string | undefined) ??
                tSeverity('unknown'),
            },
            {
              key: 'user',
              header: t('user'),
              headerClassName: 'py-2 pr-4 font-medium',
              className: 'py-2 pr-4 text-gray-300 font-mono',
              render: (entry) => entry.data?.userId as string | undefined,
            },
            {
              key: 'thread',
              header: t('thread'),
              headerClassName: 'py-2 pr-4 font-medium',
              className: 'py-2 pr-4 text-gray-300 font-mono',
              render: (entry) => entry.target ?? '-',
            },
            {
              key: 'context',
              header: t('context'),
              headerClassName: 'py-2 font-medium',
              className: 'py-2 text-gray-300',
              render: (entry) => (
                <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap max-w-md">
                  {JSON.stringify(entry.data?.context ?? {}, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      )}

      {!loading && nextCursor !== null && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-white hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loadingMore ? t('loading_more') : t('load_more')}
        </button>
      )}

      <div className="flex items-center justify-between text-sm text-gray-400 pt-2 border-t border-gray-700">
        <p>{t('footer')}</p>
        <Link href="/admin" className="text-brand-green hover:underline">
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
