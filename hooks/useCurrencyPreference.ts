'use client';

import { useCallback, useSyncExternalStore } from 'react';

export const SUPPORTED_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'NGN', 'KES'] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

const STORAGE_KEY = 'currency-preference';
const DEFAULT_CURRENCY: CurrencyCode = 'USD';

function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCY_CODES as readonly string[]).includes(value)
  );
}

function getStoredCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isSupportedCurrency(stored) ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function setStoredCurrency(currency: CurrencyCode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

// Module-level shared store so every consumer subscribes to the same value.
let currentCurrency: CurrencyCode = DEFAULT_CURRENCY;
let initialised = false;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function getSnapshot(): CurrencyCode {
  if (!initialised) {
    currentCurrency = getStoredCurrency();
    initialised = true;
  }
  return currentCurrency;
}

/** The server never knows the stored preference, so SSR (and hydration) render USD. */
function getServerSnapshot(): CurrencyCode {
  return DEFAULT_CURRENCY;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = isSupportedCurrency(event.newValue)
      ? event.newValue
      : DEFAULT_CURRENCY;
    if (next === currentCurrency) return;
    currentCurrency = next;
    initialised = true;
    emitChange();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function setCurrency(currency: CurrencyCode): void {
  if (!isSupportedCurrency(currency)) return;
  if (currency === currentCurrency) {
    setStoredCurrency(currency);
    return;
  }
  currentCurrency = currency;
  initialised = true;
  setStoredCurrency(currency);
  emitChange();
}

export interface UseCurrencyPreferenceResult {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  supported: readonly CurrencyCode[];
}

export function useCurrencyPreference(): UseCurrencyPreferenceResult {
  const currency = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setCurrencyCallback = useCallback((next: CurrencyCode) => {
    setCurrency(next);
  }, []);

  return {
    currency,
    setCurrency: setCurrencyCallback,
    supported: SUPPORTED_CURRENCY_CODES,
  };
}
