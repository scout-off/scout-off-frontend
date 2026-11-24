'use client';
import { useCallback, useRef } from 'react';
import { createIdempotencyKey } from '@/lib/idempotency';

/**
 * Idempotency protection for payToContact/subscribe submissions
 * (issue #1177). Wraps a submit action with:
 *
 *  - A synchronous in-flight mutex, checked and set before any `await`, so
 *    a fast double-click — or any re-invocation while a submission is
 *    still pending — returns the SAME in-flight promise instead of
 *    building/signing/submitting a second transaction. This is real
 *    protection: the check happens on the JS call stack before React has
 *    had a chance to re-render the disabled button, so it doesn't depend
 *    on UI state having visually caught up.
 *  - A client-generated idempotency key (crypto.randomUUID()) per NEW
 *    attempt, passed into the action so it's available to include in any
 *    request/log metadata.
 *  - A short-lived cache of the last *successful* result keyed by that
 *    idempotency key, so a caller that retries with the SAME explicit key
 *    (e.g. a future useOfflineQueue/fetchWithRetry integration) gets the
 *    already-completed result instead of resubmitting. A failed attempt is
 *    never cached, so retrying after a failure with the same key still
 *    genuinely retries.
 *
 * What this is NOT: contract-level idempotency (this repo doesn't include
 * the Soroban contract's Rust source, so a contract-level nonce/dedup check
 * can't be added or verified here) or server-side dedup (payToContact and
 * subscribe are direct client-to-RPC calls with no server proxy in this
 * codebase to enforce anything on). See docs/payment-idempotency.md for the
 * full accounting of what layer this protection lives at.
 */
export function useSubmissionGuard<T>() {
  const inFlightRef = useRef<{ key: string; promise: Promise<T> } | null>(null);
  const lastCompletedRef = useRef<{ key: string; result: T } | null>(null);

  const submit = useCallback(
    (
      action: (idempotencyKey: string) => Promise<T>,
      explicitKey?: string,
    ): Promise<T> => {
      const key = explicitKey ?? createIdempotencyKey();

      const completed = lastCompletedRef.current;
      if (completed && completed.key === key) {
        return Promise.resolve(completed.result);
      }

      const inFlight = inFlightRef.current;
      if (inFlight) {
        return inFlight.promise;
      }

      const promise = action(key)
        .then((result) => {
          lastCompletedRef.current = { key, result };
          return result;
        })
        .finally(() => {
          inFlightRef.current = null;
        });

      inFlightRef.current = { key, promise };
      return promise;
    },
    [],
  );

  return submit;
}
