import { useState, useEffect } from "react";

/**
 * useDebounce – delays updating the returned value until `delay` ms have
 * elapsed since the last change to `value`.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in milliseconds.
 * @returns The debounced value.
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
