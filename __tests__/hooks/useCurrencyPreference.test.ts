/**
 * Issue #1063 — unit test coverage for useCurrencyPreference
 * (hooks/useCurrencyPreference.ts), the localStorage-backed fiat display
 * preference shared by XlmFiatDisplay and the Navbar currency picker.
 *
 * The hook keeps one module-level store that reads localStorage lazily on
 * first use, so the first test seeds the stored value and later tests drive the store through its public API.
 */
import { renderHook, act } from '@testing-library/react';

const STORAGE_KEY = 'currency-preference';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hook =
  require('@/hooks/useCurrencyPreference') as typeof import('@/hooks/useCurrencyPreference');
const { useCurrencyPreference, SUPPORTED_CURRENCY_CODES } = hook;

function storageEvent(
  newValue: string | null,
  key: string | null = STORAGE_KEY,
) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
}

describe('useCurrencyPreference', () => {
  it('reads the stored currency on first use', () => {
    // The store has not been read yet, so this seeds its initial value.
    window.localStorage.setItem(STORAGE_KEY, 'EUR');
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('EUR');
  });

  it('exposes the supported currency codes', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.supported).toEqual(SUPPORTED_CURRENCY_CODES);
    expect(result.current.supported).toContain('NGN');
  });

  it('persists a new currency and notifies every consumer', () => {
    const a = renderHook(() => useCurrencyPreference());
    const b = renderHook(() => useCurrencyPreference());

    act(() => a.result.current.setCurrency('GBP'));

    expect(a.result.current.currency).toBe('GBP');
    expect(b.result.current.currency).toBe('GBP');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('GBP');
  });

  it('rejects unsupported currencies', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    act(() => result.current.setCurrency('USD'));

    act(() => result.current.setCurrency('BTC' as unknown as 'USD'));

    expect(result.current.currency).toBe('USD');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('USD');
  });

  it('syncs changes made in another tab via the storage event', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    storageEvent('KES');
    expect(result.current.currency).toBe('KES');
  });

  it('falls back to USD when another tab stores an unsupported value', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    storageEvent('NGN');
    storageEvent('BTC');
    expect(result.current.currency).toBe('USD');
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    storageEvent('EUR');
    storageEvent('GBP', 'some-other-key');
    expect(result.current.currency).toBe('EUR');
  });
});
