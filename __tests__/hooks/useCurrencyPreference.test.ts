/**
 * Issue #1063 — unit test coverage for useCurrencyPreference
 * (hooks/useCurrencyPreference.ts), the localStorage-backed fiat display
 * preference shared by XlmFiatDisplay and the Navbar currency picker.
 */
import { renderHook, act } from '@testing-library/react';
import {
  SUPPORTED_CURRENCIES,
  useCurrencyPreference,
} from '@/hooks/useCurrencyPreference';
import { CURRENCY_PREFERENCE_KEY } from '@/lib/storageKeys';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCurrencyPreference — default preference', () => {
  it('falls back to USD when nothing is stored', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });

  it('exposes the supported currencies for the selector', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.supported).toBe(SUPPORTED_CURRENCIES);
    expect(result.current.supported.map((c) => c.code)).toContain('USD');
  });
});

describe('useCurrencyPreference — stored preference', () => {
  it('reads a previously stored supported currency', () => {
    const other = SUPPORTED_CURRENCIES.find((c) => c.code !== 'USD')!.code;
    window.localStorage.setItem(CURRENCY_PREFERENCE_KEY, other);
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe(other);
  });

  it('ignores an unsupported stored value', () => {
    window.localStorage.setItem(CURRENCY_PREFERENCE_KEY, 'NOT_A_CURRENCY');
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });
});

describe('useCurrencyPreference — updating', () => {
  it('updates the selection and persists it to localStorage', () => {
    const other = SUPPORTED_CURRENCIES.find((c) => c.code !== 'USD')!.code;
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => result.current.setCurrency(other));

    expect(result.current.currency).toBe(other);
    expect(window.localStorage.getItem(CURRENCY_PREFERENCE_KEY)).toBe(other);
  });

  it('keeps a stable setter between renders', () => {
    const { result, rerender } = renderHook(() => useCurrencyPreference());
    const first = result.current.setCurrency;
    rerender();
    expect(result.current.setCurrency).toBe(first);
  });
});
