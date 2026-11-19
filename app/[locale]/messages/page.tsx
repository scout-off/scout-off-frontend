'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/localeFormat';

type Thread = {
  id: string;
  counterpart: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export default function MessagesInboxPage() {
  const t = useTranslations('messages.inbox');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const { isConnected, isReady } = useRequireWallet();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !isConnected) return;
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/threads')
      .then((res) => {
        if (!res.ok) throw new Error(t('loadError'));
        return res.json();
      })
      .then((data: Thread[]) => {
        if (!cancelled) setThreads(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReady, isConnected, t]);

  if (!isReady) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState title={t('walletRequiredTitle')} description={t('walletRequiredDescription')} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : threads.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/${locale}/messages/${thread.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{thread.counterpart}</p>
                  <p className="truncate text-sm text-gray-500">{thread.lastMessage}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-gray-400">
                    {formatRelativeTime(thread.lastMessageAt, locale)}
                  </span>
                  {thread.unreadCount > 0 && (
                    <span
                      className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white"
                      aria-label={t('unreadCount', { count: thread.unreadCount })}
                    >
                      {thread.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
