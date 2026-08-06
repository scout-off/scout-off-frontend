'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Hardcoded subset of ISO 4217 codes the platform supports for display. */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'NGN', label: 'Nigerian Naira (₦)' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

const DEFAULT_CURRENCY: CurrencyCode = 'USD';

const STORAGE_KEY = 'scoutoff_currency_preference';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getStoredCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
      return stored as CurrencyCode;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return DEFAULT_CURRENCY;
}

function setStoredCurrency(currency: CurrencyCode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Silently ignore storage errors
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export interface CurrencyPreferenceReturn {
  /** Currently selected currency code. */
  currency: CurrencyCode;
  /** Set the currency preference (persisted to localStorage). */
  setCurrency: (c: CurrencyCode) => void;
  /** All supported currencies for the selector UI. */
  supported: typeof SUPPORTED_CURRENCIES;
}

/**
 * Manages the user's fiat currency preference, persisted in localStorage.
 * Used by the currency selector UI and all XLM-to-fiat display call sites.
 */
export function useCurrencyPreference(): CurrencyPreferenceReturn {
  const [currency, setCurrencyState] =
    useState<CurrencyCode>(getStoredCurrency);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    setStoredCurrency(c);
  }, []);

  return useMemo(
    () => ({ currency, setCurrency, supported: SUPPORTED_CURRENCIES }),
    [currency, setCurrency],
  );
}
