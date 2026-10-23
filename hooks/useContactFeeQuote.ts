'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  fetchStrictReceiveQuote,
  USDC,
  type FeeAsset,
  type PathQuote,
} from '@/lib/pathPayment';

/**
 * Fetches a Horizon strict-receive quote for paying `feeXlm` with `asset`
 * (issue #1321) and tracks how long it stays valid. The quote is not
 * refreshed automatically once it expires: the scout must refresh it, so they
 * always see the price they are agreeing to.
 */
export function useContactFeeQuote(
  feeXlm: number,
  enabled: boolean,
  asset: FeeAsset = USDC,
) {
  const t = useTranslations('scout.contact_modal');
  const [quote, setQuote] = useState<PathQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Request-scoped token used to guard against stale quote overwrites
  // (issue #1497). Each call to `refresh` increments this token and captures
  // its value before awaiting `fetchStrictReceiveQuote`. When the response
  // resolves, the callback only commits state if the token still matches —
  // if a newer request (or asset/fee change) has bumped the token in the
  // meantime, the stale response is discarded.
  const requestToken = useRef(0);

  const refresh = useCallback(async () => {
    // Bump the token so any in-flight request is invalidated.
    const token = ++requestToken.current;
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchStrictReceiveQuote(feeXlm, asset);
      // A newer request, or an asset/fee change, bumped the token — discard
      // this stale response instead of overwriting the newer quote.
      if (token !== requestToken.current) return;
      setQuote(fetched);
    } catch (err) {
      // A newer request invalidated this one — don't clobber its state.
      if (token !== requestToken.current) return;
      setQuote(null);
      setError(err instanceof Error ? err.message : t('quote_error'));
    } finally {
      if (token === requestToken.current) {
        setLoading(false);
        setNow(Date.now());
      }
    }
  }, [feeXlm, asset, t]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!quote) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [quote]);

  const secondsLeft = quote
    ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))
    : 0;

  return {
    quote,
    error,
    loading,
    refresh,
    secondsLeft,
    expired: quote !== null && secondsLeft === 0,
  };
}
