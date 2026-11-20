/**
 * Issue #1067 — hook test coverage suite.
 * Tests for useNotificationPreferences (hooks/useNotificationPreferences.ts),
 * which reads/writes per-channel notification settings for
 * components/NotificationPreferencesPanel.tsx.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  fetchNotificationPreferences: jest.fn(),
  saveNotificationPreferences: jest.fn(),
}));

import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from '@/lib/api';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type { NotificationPreferences } from '@/types';

const mockFetch = fetchNotificationPreferences as jest.Mock;
const mockSave = saveNotificationPreferences as jest.Mock;

const PREFS: NotificationPreferences = {
  email: true,
  push: false,
  inApp: true,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue(PREFS);
  mockSave.mockResolvedValue(PREFS);
});

describe('useNotificationPreferences — loading on mount', () => {
  it('loads existing preferences on mount', async () => {
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.preferences).toEqual(PREFS);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('loading is true while the fetch is in-flight', async () => {
    let resolveFetch: (prefs: NotificationPreferences) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise<NotificationPreferences>(
          (resolve) => (resolveFetch = resolve),
        ),
    );

    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(PREFS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.preferences).toEqual(PREFS);
  });
});

describe('useNotificationPreferences — successful save', () => {
  it('updates local state optimistically on a successful save', async () => {
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const next: NotificationPreferences = { ...PREFS, push: true };

    await act(async () => {
      await result.current.save(next);
    });

    expect(mockSave).toHaveBeenCalledWith(next);
    expect(result.current.preferences).toEqual(next);
    expect(result.current.error).toBeNull();
  });
});

describe('useNotificationPreferences — failed save', () => {
  it('rolls back the optimistic update when the save fails', async () => {
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.preferences).toEqual(PREFS);

    mockSave.mockRejectedValue(new Error('Save failed'));
    const next: NotificationPreferences = { ...PREFS, push: true };

    await act(async () => {
      await result.current.save(next);
    });

    expect(mockSave).toHaveBeenCalledWith(next);
    expect(result.current.preferences).toEqual(PREFS);
    expect(result.current.error).toBe('Save failed');
  });
});
