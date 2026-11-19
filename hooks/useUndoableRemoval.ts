import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Optimistically removes an item and defers the real delete (`onCommit`) for
 * `UNDO_WINDOW_MS`, giving the user a chance to undo.
 *
 * IMPORTANT for `onCommit` implementors: pending commits are flushed when the
 * owning component unmounts or the page is hidden/closed. Fetch-based commits
 * should therefore pass `keepalive: true` (or use `navigator.sendBeacon`) so
 * the request survives page teardown.
 */
const UNDO_WINDOW_MS = 5000;

type PendingRemoval = {
  timer: ReturnType<typeof setTimeout>;
  onCommit: () => void | Promise<void>;
};

export function useUndoableRemoval() {
  const t = useTranslations('common');
  const timersRef = useRef<Map<string, PendingRemoval>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const flushAll = useCallback(() => {
    const pending = timersRef.current;
    pending.forEach(({ timer, onCommit }) => {
      clearTimeout(timer);
      void onCommit();
    });
    pending.clear();
    setPendingIds(new Set());
  }, []);

  const remove = useCallback(
    (id: string, onCommit: () => void | Promise<void>) => {
      const existing = timersRef.current.get(id);
      if (existing) {
        clearTimeout(existing.timer);
      }

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void onCommit();
      }, UNDO_WINDOW_MS);

      timersRef.current.set(id, { timer, onCommit });
      setPendingIds((prev) => new Set(prev).add(id));
    },
    [],
  );

  const undo = useCallback((id: string) => {
    const pending = timersRef.current.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    timersRef.current.delete(id);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const handlePageHide = () => flushAll();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushAll();
    };
  }, [flushAll]);

  return { remove, undo, pendingIds, undoLabel: t('undo') };
}
