'use client';

import { useCallback, useEffect, useRef } from 'react';
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

/**
 * Reusable undo-toast pattern: applies a removal optimistically, then delays
 * the actual delete (onCommit) until `windowMs` has passed. An "Undo" action
 * on the toast cancels the pending delete and restores prior state; once the
 * window expires the removal is final.
 */
export function useUndoableRemoval(windowMs: number = DEFAULT_UNDO_WINDOW_MS) {
  const { show } = useToast();
  const timersRef = useRef<Map<string | number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return useCallback(
    (params: UndoableRemovalParams) => {
      const { id, message, onOptimisticRemove, onRestore, onCommit } = params;

      // A removal already pending for this id runs to completion untouched;
      // starting a second one for the same id would double-commit.
      if (timersRef.current.has(id)) return;

      onOptimisticRemove();
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        void onCommit();
      }, windowMs);
      timersRef.current.set(id, timer);

      show({
        message,
        variant: 'info',
        duration: windowMs,
        action: {
          label: 'Undo',
          onClick: () => {
            const pending = timersRef.current.get(id);
            if (!pending) return; // window already expired
            clearTimeout(pending);
            timersRef.current.delete(id);
            onRestore();
          },
        },
      });
    },
    [show, windowMs],
  );
}
