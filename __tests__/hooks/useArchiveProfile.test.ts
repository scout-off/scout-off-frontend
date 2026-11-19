/**
 * Issue #1061 — hook test coverage suite.
 * Tests for useArchiveProfile (hooks/useArchiveProfile.ts), which wraps
 * archiving a player's profile and is consumed by
 * components/player/ArchiveProfileModal.tsx.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  archivePlayerProfile: jest.fn(),
}));

import { archivePlayerProfile } from '@/lib/api';
import { useArchiveProfile } from '@/hooks/useArchiveProfile';

const mockArchive = archivePlayerProfile as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockArchive.mockResolvedValue(undefined);
});

describe('useArchiveProfile — happy path', () => {
  it('updates loading/success state after a successful archive call', async () => {
    const { result } = renderHook(() => useArchiveProfile());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBe(false);

    await act(async () => {
      await result.current.archive('player-1');
    });

    expect(mockArchive).toHaveBeenCalledWith('player-1');
    expect(result.current.loading).toBe(false);
    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('useArchiveProfile — loading state', () => {
  it('loading is true while the archive request is in-flight', async () => {
    let resolveArchive: () => void = () => {};
    mockArchive.mockImplementation(
      () => new Promise<void>((resolve) => (resolveArchive = resolve)),
    );

    const { result } = renderHook(() => useArchiveProfile());

    let pending: Promise<void>;
    act(() => {
      pending = result.current.archive('player-1');
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveArchive();
      await pending;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.success).toBe(true);
  });

  it('does not double-submit while a request is in flight', async () => {
    let resolveArchive: () => void = () => {};
    mockArchive.mockImplementation(
      () => new Promise<void>((resolve) => (resolveArchive = resolve)),
    );

    const { result } = renderHook(() => useArchiveProfile());

    let first: Promise<void>;
    act(() => {
      first = result.current.archive('player-1');
    });

    await act(async () => {
      await result.current.archive('player-1');
    });

    expect(mockArchive).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveArchive();
      await first;
    });

    expect(mockArchive).toHaveBeenCalledTimes(1);
  });
});

describe('useArchiveProfile — error state', () => {
  it('surfaces a mapped error message when the archive call fails', async () => {
    mockArchive.mockRejectedValue(new Error('Player already archived'));

    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await result.current.archive('player-1');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.success).toBe(false);
    expect(result.current.error).toBe('Player already archived');
  });
});

describe('useArchiveProfile — reset', () => {
  it('reset clears success/error state between calls', async () => {
    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await result.current.archive('player-1');
    });

    expect(result.current.success).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.success).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
