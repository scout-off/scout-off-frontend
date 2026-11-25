'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ChatThread from '@/components/messaging/ChatThread';
import ReportBlockControls from '@/components/messaging/ReportBlockControls';
import BlockedStateMessage from '@/components/messaging/BlockedStateMessage';
import EmptyState from '@/components/ui/EmptyState';
import { useRequireWallet } from '@/lib/hooks/useRequireWallet';
import { apiFetch } from '@/lib/api';

type ThreadDetail = {
  id: string;
  counterpart: { address: string; displayName?: string };
  blockedByMe: boolean;
  blockedByThem: boolean;
};

export default function ThreadPage() {
  const t = useTranslations('messages.thread');
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const { address, isReady } = useRequireWallet();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const threadId = params?.threadId;

  const loadThread = useCallback(async () => {
    if (!address || !threadId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ThreadDetail>(`/threads/${threadId}`);
      setThread(data);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [address, threadId, t]);

  useEffect(() => {
    if (isReady && address) {
      void loadThread();
    }
  }, [isReady, address, loadThread]);

  if (!isReady) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 space-y-3">
          <div className="h-16 animate-pulse rounded bg-gray-100" />
          <div className="h-16 animate-pulse rounded bg-gray-100" />
          <div className="h-16 animate-pulse rounded bg-gray-100" />
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 space-y-3">
          <div className="h-16 animate-pulse rounded bg-gray-100" />
          <div className="h-16 animate-pulse rounded bg-gray-100" />
          <div className="h-16 animate-pulse rounded bg-gray-100" />
        </div>
      </main>
    );
  }

  if (error || !thread) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <EmptyState
          title={t('notFoundTitle')}
          description={error ?? t('notFoundDescription')}
          actionLabel={t('backToInbox')}
          onAction={() => router.push('/messages')}
        />
      </main>
    );
  }

  const isBlocked = thread.blockedByMe || thread.blockedByThem;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push('/messages')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('backToInbox')}
          </button>
          <h1 className="truncate text-xl font-semibold text-gray-900">
            {thread.counterpart.displayName ?? thread.counterpart.address}
          </h1>
        </div>
        <ReportBlockControls
          targetAddress={thread.counterpart.address}
          threadId={thread.id}
          onBlockedChange={() => void loadThread()}
        />
      </header>

      {isBlocked ? (
        <div className="mt-6">
          <BlockedStateMessage
            blockedByMe={thread.blockedByMe}
            blockedByThem={thread.blockedByThem}
          />
        </div>
      ) : null}

      <div className="mt-6 flex-1">
        <ChatThread threadId={thread.id} disabled={isBlocked} />
      </div>
    </main>
  );
}
