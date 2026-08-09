import { useState, useEffect } from 'react';

/**
 * useDebounce – delays updating the returned value until `delay` milliseconds have
 * elapsed since the last change to `value`.
 *
 * This is useful for building responsive search inputs, filters, or any UI that
 * should not re-render / re-fetch on every keystroke. Each time `value` changes,
 * the previous timer is cleared and a new one starts, so only the final value
 * (after a quiet `delay` period) is emitted.
 *
 * @param value - The value to debounce. Generic type `T`; any serialisable value
 *   (string, number, object, array, etc.) is supported.
 * @param delay - Debounce delay in milliseconds. New changes to `value` restart
 *   the timer, so the hook only settles once `value` has been stable for at least
 *   `delay` ms.
 * @returns The debounced value. Initially equal to `value`, then updated only
 *   after `delay` ms of stability.
 *
 * @example
 * Debounce a search term so the parent only re-queries after the user pauses
 * typing for 400 ms:
 *
 * ```tsx
 * const [term, setTerm] = useState('');
 * const debouncedTerm = useDebounce(term, 400);
 *
 * useEffect(() => {
 *   if (debouncedTerm) void searchPlayers(debouncedTerm);
 * }, [debouncedTerm]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
