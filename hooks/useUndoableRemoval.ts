'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/Toast';

const DEFAULT_UNDO_WINDOW_MS = 5000;

interface UndoableRemovalParams {
  /** Uniquely identifies this removal so a stray Undo click can't affect an unrelated one. */
  id: string | number;
  message: string;
  /** Applied immediately, before the undo window starts. */
  onOptimisticRemove: () => void;
  /** Applied if Undo is clicked before the window expires. */
  onRestore: () => void;
  /** The real deletion — deferred until the window expires uninterrupted. */
  onCommit: () => void | Promise<void>;
}

interface PendingRemoval {
  timer: ReturnType<typeof setTimeout>;
  onCommit: () => void | Promise<void>;
}

/**
 * Reusable undo-toast pattern: applies a removal optimistically, then delays
 * the actual delete (onCommit) until `windowMs` has passed. An "Undo" action
 * on the toast cancels the pending delete and restores prior state; once the
 * window expires the removal is final.
 *
 * Issue #1684: if the component unmounts (or the page is hidden/unloaded)
 * while removals are still pending, they are committed immediately instead
 * of being silently dropped — otherwise the item would disappear from the UI
 * and reappear on the next visit.
 */
export function useUndoableRemoval(windowMs: number = DEFAULT_UNDO_WINDOW_MS) {
  const { show } = useToast();
  const t = useTranslations('common');
  const pendingRef = useRef<Map<string | number, PendingRemoval>>(new Map());

  useEffect(() => {
    const pending = pendingRef.current;
    const flush = () => {
      pending.forEach(({ timer, onCommit }) => {
        clearTimeout(timer);
        void onCommit();
      });
      pending.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return useCallback(
    (params: UndoableRemovalParams) => {
      const { id, message, onOptimisticRemove, onRestore, onCommit } = params;

      // A removal already pending for this id runs to completion untouched;
      // starting a second one for the same id would double-commit.
      if (pendingRef.current.has(id)) return;

      onOptimisticRemove();
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        void onCommit();
      }, windowMs);
      pendingRef.current.set(id, { timer, onCommit });

      show({
        message,
        variant: 'info',
        duration: windowMs,
        action: {
          label: t('undo'),
          onClick: () => {
            const pending = pendingRef.current.get(id);
            if (!pending) return; // window already expired
            clearTimeout(pending.timer);
            pendingRef.current.delete(id);
            onRestore();
          },
        },
      });
    },
    [show, t, windowMs],
  );
}
