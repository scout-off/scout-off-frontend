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
});
