import { renderHook, act } from '@testing-library/react';
import {
  useCurrencyPreference,
  SUPPORTED_CURRENCIES,
} from '@/hooks/useCurrencyPreference';

const STORAGE_KEY = 'scoutoff_currency_preference';

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('useCurrencyPreference', () => {
  it('initializes to DEFAULT_CURRENCY (USD) when nothing is stored', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });

  it('initializes to a valid stored currency instead of the default', () => {
    localStorage.setItem(STORAGE_KEY, 'EUR');
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('EUR');
  });

  it('falls back to DEFAULT_CURRENCY when the stored value is not supported', () => {
    localStorage.setItem(STORAGE_KEY, 'XYZ');
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });

  it('setCurrency updates the returned currency and persists it to localStorage', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.setCurrency('GBP');
    });

    expect(result.current.currency).toBe('GBP');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('GBP');
  });

  it('supported always returns the full SUPPORTED_CURRENCIES list regardless of selection', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    expect(result.current.supported).toEqual(SUPPORTED_CURRENCIES);

    act(() => {
      result.current.setCurrency('JPY');
    });

    expect(result.current.supported).toEqual(SUPPORTED_CURRENCIES);
  });

  it('falls back to the default without crashing when localStorage.getItem throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: private browsing');
    });

    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });

  it('does not crash and still updates in-memory state when localStorage.setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.setCurrency('CAD');
    });

    expect(result.current.currency).toBe('CAD');
  });

  it('shares state across consumers so a change in one updates the other', () => {
    const first = renderHook(() => useCurrencyPreference());
    const second = renderHook(() => useCurrencyPreference());

    act(() => {
      first.result.current.setCurrency('EUR');
    });

    expect(first.result.current.currency).toBe('EUR');
    expect(second.result.current.currency).toBe('EUR');
  });

  it('updates the preference when a storage event arrives from another tab', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'GBP',
        })
      );
    });

    expect(result.current.currency).toBe('GBP');
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'some_other_key',
          newValue: 'JPY',
        })
      );
    });

    expect(result.current.currency).toBe('USD');
  });

  it('falls back to USD when a storage event carries an invalid value', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.setCurrency('EUR');
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'XYZ',
        })
      );
    });

    expect(result.current.currency).toBe('USD');
  });
});
