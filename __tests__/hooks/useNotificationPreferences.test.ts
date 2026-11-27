/**
 * Tests for useNotificationPreferences (hooks/useNotificationPreferences.ts),
 * which loads the wallet's notification category preferences and applies
 * optimistic updates with rollback on failure (issue #560).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

jest.mock('@/lib/notificationPreferencesClient', () => ({
  fetchNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
  DEFAULT_NOTIFICATION_PREFERENCES: {
    milestoneApprovals: true,
    contactUnlocks: true,
  },
}));

import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/notificationPreferencesClient';
import {
  notificationPreferencesKey,
  useNotificationPreferences,
} from '@/hooks/useNotificationPreferences';
import type { NotificationPreferences } from '@/types';

const mockFetch = fetchNotificationPreferences as jest.Mock;
const mockUpdate = updateNotificationPreferences as jest.Mock;

const WALLET = 'GWALLET';
const STORED: NotificationPreferences = {
  milestoneApprovals: false,
  contactUnlocks: true,
  version: 1,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        shouldRetryOnError: false,
        dedupingInterval: 0,
      },
    },
    children,
  );
}

function renderPrefs(wallet: string | null = WALLET) {
  return renderHook(() => useNotificationPreferences(wallet), { wrapper });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetch.mockResolvedValue(STORED);
});

describe('notificationPreferencesKey', () => {
  it('is null without a wallet and wallet-scoped otherwise', () => {
    expect(notificationPreferencesKey(null)).toBeNull();
    expect(notificationPreferencesKey(WALLET)).toBe(
      `notification-preferences:${WALLET}`,
    );
  });
});

describe('useNotificationPreferences', () => {
  it('returns the defaults until the stored preferences load', async () => {
    const { result } = renderPrefs();

    expect(result.current.preferences).toEqual({
      milestoneApprovals: true,
      contactUnlocks: true,
    });
    await waitFor(() => expect(result.current.preferences).toEqual(STORED));
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch without a wallet', async () => {
    renderPrefs(null);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('applies an update optimistically and keeps the saved value', async () => {
    const next = { ...STORED, milestoneApprovals: true };
    const saved = { ...next, version: 2 };
    mockUpdate.mockResolvedValue(saved);
    const { result } = renderPrefs();
    await waitFor(() => expect(result.current.preferences).toEqual(STORED));

    await act(async () => {
      await result.current.update(next);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(next);
    expect(result.current.preferences).toEqual(saved);
  });

  it('rolls back and rethrows when the update fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Save failed'));
    const { result } = renderPrefs();
    await waitFor(() => expect(result.current.preferences).toEqual(STORED));

    await act(async () => {
      await expect(
        result.current.update({ ...STORED, contactUnlocks: false }),
      ).rejects.toThrow('Save failed');
    });

    expect(result.current.preferences).toEqual(STORED);
  });

  it('surfaces load errors', async () => {
    mockFetch.mockRejectedValue(new Error('Preferences unavailable'));
    const { result } = renderPrefs();

    await waitFor(() =>
      expect(result.current.error).toBe('Preferences unavailable'),
    );
  });
});
