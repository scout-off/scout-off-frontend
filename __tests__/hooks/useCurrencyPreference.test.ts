/**
 * Issue #1063 — unit test coverage for useCurrencyPreference
 * (hooks/useCurrencyPreference.ts), which reads/writes the scout's
 * XLM-vs-fiat display preference consumed by XlmFiatDisplay and Navbar.
 *
 * Follows the same renderHook + module-boundary mocking conventions used by
 * the sibling hook specs under __tests__/hooks/.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  fetchCurrencyPreference: jest.fn(),
  saveCurrencyPreference: jest.fn(),
}));

import {
  fetchCurrencyPreference,
  saveCurrencyPreference,
} from '@/lib/api';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';

const mockFetch = fetchCurrencyPreference as jest.Mock;
const mockSave = saveCurrencyPreference as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockSave.mockResolvedValue(undefined);
});

describe('useCurrencyPreference — default preference', () => {
  it('falls back to the default when nothing is stored', async () => {
    mockFetch.mockResolvedValue(null);

    const { result } = renderHook(() => useCurrencyPreference());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.preference).toBe('xlm');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useCurrencyPreference — reading stored preference', () => {
  it('reads an existing stored preference on mount', async () => {
    mockFetch.mockResolvedValue('fiat');

    const { result } = renderHook(() => useCurrencyPreference());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.preference).toBe('fiat');
    expect(result.current.loading).toBe(false);
  });
});

describe('useCurrencyPreference — persisting a change', () => {
  it('persists a changed preference and it survives a re-render', async () => {
    mockFetch.mockResolvedValue('xlm');

    const { result, rerender } = renderHook(() => useCurrencyPreference());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.preference).toBe('xlm');

    await act(async () => {
      await result.current.setPreference('fiat');
    });

    expect(mockSave).toHaveBeenCalledWith('fiat');
    expect(result.current.preference).toBe('fiat');

    rerender();

    expect(result.current.preference).toBe('fiat');
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
