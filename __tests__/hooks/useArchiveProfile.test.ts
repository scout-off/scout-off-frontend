/**
 * Tests for useArchiveProfile (hooks/useArchiveProfile.ts), which wraps the
 * player profile archive / unarchive API calls with loading and error state.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  archivePlayerProfile: jest.fn(),
  unarchivePlayerProfile: jest.fn(),
}));

import { archivePlayerProfile, unarchivePlayerProfile } from '@/lib/api';
import { useArchiveProfile } from '@/hooks/useArchiveProfile';

const mockArchive = archivePlayerProfile as jest.Mock;
const mockUnarchive = unarchivePlayerProfile as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockArchive.mockResolvedValue({ archived: true });
  mockUnarchive.mockResolvedValue({ archived: false });
});

describe('useArchiveProfile — archive', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useArchiveProfile());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('archives the profile and returns the API result', async () => {
    const { result } = renderHook(() => useArchiveProfile());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.archive('player-1');
    });

    expect(mockArchive).toHaveBeenCalledWith('player-1');
    expect(returned).toEqual({ archived: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('is loading while the archive request is in flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockArchive.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useArchiveProfile());

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.archive('player-1');
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve({ archived: true });
      await pending;
    });
    expect(result.current.loading).toBe(false);
  });

  it('surfaces the error message and rethrows when archiving fails', async () => {
    mockArchive.mockRejectedValue(new Error('Player already archived'));
    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await expect(result.current.archive('player-1')).rejects.toThrow(
        'Player already archived',
      );
    });

    expect(result.current.error).toBe('Player already archived');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    mockArchive.mockRejectedValue('boom');
    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await result.current.archive('player-1').catch(() => undefined);
    });

    expect(result.current.error).toBe('Failed to archive profile');
  });
});

describe('useArchiveProfile — unarchive', () => {
  it('unarchives the profile and clears a previous error', async () => {
    mockArchive.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await result.current.archive('player-1').catch(() => undefined);
    });
    expect(result.current.error).toBe('nope');

    await act(async () => {
      await result.current.unarchive('player-1');
    });

    expect(mockUnarchive).toHaveBeenCalledWith('player-1');
    expect(result.current.error).toBeNull();
  });

  it('reports unarchive failures', async () => {
    mockUnarchive.mockRejectedValue(new Error('Not archived'));
    const { result } = renderHook(() => useArchiveProfile());

    await act(async () => {
      await result.current.unarchive('player-1').catch(() => undefined);
    });

    expect(result.current.error).toBe('Not archived');
  });
});
