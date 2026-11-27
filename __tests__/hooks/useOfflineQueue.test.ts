/**
 * Tests for useOfflineQueue (hooks/useOfflineQueue.ts), the React wrapper
 * around the IndexedDB-backed offline action queue in lib/offlineQueue.ts.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/offlineQueue', () => ({
  enqueueAction: jest.fn(),
  processQueue: jest.fn(),
  getQueueLength: jest.fn(),
  getFailedActions: jest.fn(),
  getFailedCount: jest.fn(),
  discardFailedAction: jest.fn(),
  discardAllFailedActions: jest.fn(),
  registerHandler: jest.fn(),
}));

import {
  discardAllFailedActions,
  discardFailedAction,
  enqueueAction,
  getFailedActions,
  getQueueLength,
  processQueue,
  type FailedAction,
} from '@/lib/offlineQueue';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

const mockEnqueue = enqueueAction as jest.Mock;
const mockProcess = processQueue as jest.Mock;
const mockLength = getQueueLength as jest.Mock;
const mockFailed = getFailedActions as jest.Mock;
const mockDiscard = discardFailedAction as jest.Mock;
const mockDiscardAll = discardAllFailedActions as jest.Mock;

function failed(id: string, conflict = false): FailedAction {
  return {
    id,
    type: 'update_notification_preferences',
    payload: {},
    failedAt: 1,
    lastError: conflict ? 'conflict' : 'boom',
    conflict,
  } as unknown as FailedAction;
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  setOnline(false);
  mockLength.mockResolvedValue(0);
  mockFailed.mockResolvedValue([]);
  mockProcess.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue('action-1');
  mockDiscard.mockResolvedValue(undefined);
  mockDiscardAll.mockResolvedValue(undefined);
});

afterEach(() => setOnline(true));

describe('useOfflineQueue — counts', () => {
  it('reads pending and failed counts on mount', async () => {
    mockLength.mockResolvedValue(2);
    mockFailed.mockResolvedValue([failed('a'), failed('b', true)]);

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => expect(result.current.pendingCount).toBe(2));
    expect(result.current.status).toBe('queued');
    expect(result.current.failedCount).toBe(2);
    expect(result.current.conflictCount).toBe(1);
    expect(result.current.conflictActions.map((a) => a.id)).toEqual(['b']);
  });
});

describe('useOfflineQueue — enqueue', () => {
  it('stores the action and stays queued while offline', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    mockLength.mockResolvedValue(1);

    let id = '';
    await act(async () => {
      id = await result.current.enqueue('save', { a: 1 }, { baseVersion: 3 });
    });

    expect(id).toBe('action-1');
    expect(mockEnqueue).toHaveBeenCalledWith(
      'save',
      { a: 1 },
      {
        baseVersion: 3,
      },
    );
    expect(mockProcess).not.toHaveBeenCalled();
    expect(result.current.pendingCount).toBe(1);
  });

  it('processes immediately when online', async () => {
    setOnline(true);
    const { result } = renderHook(() => useOfflineQueue());
    await waitFor(() => expect(mockProcess).toHaveBeenCalled());
    mockProcess.mockClear();

    await act(async () => {
      await result.current.enqueue('save', {});
    });

    await waitFor(() => expect(mockProcess).toHaveBeenCalledTimes(1));
  });

  it('processes the queue when the browser comes back online', async () => {
    renderHook(() => useOfflineQueue());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(mockProcess).toHaveBeenCalled());
  });
});

describe('useOfflineQueue — dead letters', () => {
  it('discards a single failed action and refreshes', async () => {
    mockFailed.mockResolvedValueOnce([failed('a')]).mockResolvedValue([]);
    const { result } = renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.failedCount).toBe(1));

    await act(async () => {
      await result.current.discardFailed('a');
    });

    expect(mockDiscard).toHaveBeenCalledWith('a');
    expect(result.current.failedCount).toBe(0);
  });

  it('discards all failed actions', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.discardAllFailed();
    });

    expect(mockDiscardAll).toHaveBeenCalled();
  });
});
