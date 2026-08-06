'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CurrencyCode } from './useCurrencyPreference';

// ── Cache ──────────────────────────────────────────────────────────────────────

/** How long a cached rate is considered fresh (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedRate {
  rate: number;
  fetchedAt: number;
}

/**
 * In-memory rate cache shared across all useXlmUsdRate callers so concurrent
 * components don't each hit the API even when they render the first time.
 */
const rateCache = new Map<string, CachedRate>();

/** In-flight requests keyed by currency so concurrent callers share one fetch. */
const inFlight = new Map<string, Promise<number>>();

// ── API ────────────────────────────────────────────────────────────────────────

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

/**
 * Maps our internal currency code to CoinGecko's VS currency parameter.
 * CoinGecko free API only supports a subset; we map common ones.
 */
const CG_VS_CURRENCY: Record<string, string> = {
  USD: 'usd',
  EUR: 'eur',
  GBP: 'gbp',
  NGN: 'ngn',
  KES: 'kes',
  ZAR: 'zar',
  JPY: 'jpy',
  CAD: 'cad',
  AUD: 'aud',
  BRL: 'brl',
};

async function fetchXlmRate(targetCurrency: string): Promise<number> {
  const vsCurrency =
    CG_VS_CURRENCY[targetCurrency] ?? targetCurrency.toLowerCase();
  const url = `${COINGECKO_URL}/simple/price?ids=stellar&vs_currencies=${encodeURIComponent(vsCurrency)}`;

  const resp = await fetch(url, {
    // Prevent caching proxies from serving stale data
    cache: 'no-cache',
  });

  if (!resp.ok) {
    throw new Error(`CoinGecko returned ${resp.status}`);
  }

  const data = (await resp.json()) as {
    stellar?: Record<string, number>;
  };

  const rate = data.stellar?.[vsCurrency];
  if (typeof rate !== 'number' || rate <= 0) {
    throw new Error('Invalid rate in response');
  }

  return rate;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export interface XlmRateState {
  /** XLM-to-target-currency exchange rate, or null during/after failure. */
  rate: number | null;
  /** True during initial fetch; false once resolved one way or another. */
  loading: boolean;
  /** Non-null when the most recent fetch failed (so callers can show fallback). */
  error: string | null;
}

/**
 * Fetches the current XLM → targetCurrency exchange rate from CoinGecko's free
 * public API, cached for 5 minutes in an in-memory Map shared across all
 * instances of this hook. Concurrent callers during a cache miss share a single
 * in-flight request.
 *
 * Falls back gracefully — keeps `rate` null and sets `error` — so callers
 * can hide the fiat figure and keep showing XLM-only.
 *
 * @param targetCurrency - ISO 4217 code (default `'USD'`). See CG_VS_CURRENCY
 *   for supported values.
 */
export function useXlmUsdRate(targetCurrency: string = 'USD'): XlmRateState {
  const cacheKey = `xlm:${targetCurrency}`;
  const [rate, setRate] = useState<number | null>(() => {
    const cached = rateCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rate;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    // Only show loading if we don't have a fresh cached value
    const cached = rateCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return false;
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const cached = rateCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setRate(cached.rate);
      setLoading(false);
      return;
    }

    // If there's already an in-flight request, piggyback on it.
    const existing = inFlight.get(cacheKey);
    if (existing) {
      existing
        .then((r) => {
          if (mountedRef.current) {
            setRate(r);
            setLoading(false);
            setError(null);
          }
        })
        .catch((e) => {
          if (mountedRef.current) {
            setError(e?.message ?? 'Failed to fetch rate');
            setLoading(false);
          }
        });
      return;
    }

    // Start a new request.
    const promise = fetchXlmRate(targetCurrency)
      .then((r) => {
        rateCache.set(cacheKey, { rate: r, fetchedAt: Date.now() });
        return r;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });

    inFlight.set(cacheKey, promise);

    promise
      .then((r) => {
        if (mountedRef.current) {
          setRate(r);
          setLoading(false);
          setError(null);
        }
      })
      .catch((e) => {
        if (mountedRef.current) {
          setError(e?.message ?? 'Failed to fetch rate');
          setLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { rate, loading, error };
}

/**
 * Converts an XLM amount to the target currency using the current rate.
 * Returns null if the rate is unavailable (loading or error).
 */
export function convertXlmToFiat(
  xlmAmount: number,
  rate: number | null,
): number | null {
  if (rate === null) return null;
  return xlmAmount * rate;
}

/**
 * Formats a fiat amount with appropriate currency symbol and 2 decimal places.
 */
export function formatFiat(amount: number, currency: string = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    NGN: '₦',
    KES: 'KSh',
    ZAR: 'R',
    JPY: '¥',
    CAD: 'CA$',
    AUD: 'A$',
    BRL: 'R$',
  };

  const symbol = symbols[currency] ?? currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}
