/**
 * Issue #1068 — unit test coverage for useOfflineQueue (hooks/useOfflineQueue.ts).
 * The hook queues write-action form submissions made while offline and flushes
 * them on the browser `online` event. Network/store access is mocked at the
 * module boundary, consistent with sibling hook tests under __tests__/hooks/.
 */
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/offlineQueue', () => ({
  enqueueAction: jest.fn(),
  flushQueue: jest.fn(),
  getQueuedActions: jest.fn(),
}));

import {
  enqueueAction,
  flushQueue,
  getQueuedActions,
} from '@/lib/offlineQueue';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

const mockEnqueue = enqueueAction as jest.Mock;
const mockFlush = flushQueue as jest.Mock;
const mockGetQueued = getQueuedActions as jest.Mock;

const ACTION = {
  type: 'createPlayer' as const,
  payload: { name: 'Ada Lovelace' },
};

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  setOnline(true);
  mockGetQueued.mockReturnValue([]);
  mockEnqueue.mockReturnValue(undefined);
  mockFlush.mockResolvedValue({ flushed: 0, remaining: [] });
});

describe('useOfflineQueue — public shape', () => {
  it('exposes the queue entries, loading and error state', () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current).toEqual(
      expect.objectContaining({
        entries: expect.any(Array),
        loading: expect.any(Boolean),
        error: expect.anything(),
      }),
    );
    expect(typeof result.current.enqueue).toBe('function');
    expect(typeof result.current.flush).toBe('function');
  });
});

describe('useOfflineQueue — enqueue while offline', () => {
  it('queues the action when navigator.onLine is false', () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue(ACTION);
    });

    expect(mockEnqueue).toHaveBeenCalledWith(ACTION);
    expect(mockFlush).not.toHaveBeenCalled();
  });
});

describe('useOfflineQueue — flush on online event', () => {
  it('flushes the queue automatically when the browser goes online', async () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue(ACTION);
    });

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFlush).toHaveBeenCalled();
  });
});

describe('useOfflineQueue — failed retry', () => {
  it('keeps the item in the queue when a retry fails', async () => {
    setOnline(false);
    mockFlush.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue(ACTION);
    });

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFlush).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(ACTION);
    expect(result.current.error).not.toBeNull();
  });
});
