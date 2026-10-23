import { act, renderHook, waitFor } from '@testing-library/react';
import { useApprovalQueue } from '@/hooks/useApprovalQueue';
import type { ApprovalIntent } from '@/lib/approvalQueue';

const VALIDATOR = 'GVALIDATOR';
const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

let store: ApprovalIntent[] = [];
const mockSignAndSubmit = jest.fn();
const mockGetMilestoneHistory = jest.fn();
const mockGetPlayer = jest.fn();
const mockSubmitAndConfirm = jest.fn();
const mockAvailable = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ signAndSubmit: mockSignAndSubmit }),
}));

jest.mock('@/lib/approvalQueue', () => ({
  approvalIdempotencyKey: jest.fn(
    async (i: { playerId: string; milestone: string; validator: string }) =>
      `${i.playerId}:${i.milestone}:${i.validator}`,
  ),
  isApprovalQueueAvailable: () => mockAvailable(),
  getApprovalIntents: jest.fn(async () => store.map((r) => ({ ...r }))),
  enqueueApprovalIntent: jest.fn(
    async (i: { playerId: string; milestone: string; validator: string }) => {
      const intent: ApprovalIntent = {
        ...i,
        idempotencyKey: `${i.playerId}:${i.milestone}:${i.validator}`,
        status: 'pending',
        queuedAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
      };
      store.push(intent);
      return intent;
    },
  ),
  updateApprovalIntent: jest.fn(
    async (key: string, patch: Partial<ApprovalIntent>) => {
      store = store.map((r) =>
        r.idempotencyKey === key ? { ...r, ...patch } : r,
      );
    },
  ),
  dismissApprovalIntent: jest.fn(async (key: string) => {
    store = store.filter((r) => r.idempotencyKey !== key);
  }),
}));

jest.mock('@/lib/contract', () => ({
  buildApproveMilestone: jest.fn(async () => 'xdr'),
  getMilestoneHistory: (...a: unknown[]) => mockGetMilestoneHistory(...a),
  getPlayer: (...a: unknown[]) => mockGetPlayer(...a),
}));

jest.mock('@/lib/contractErrorMessage', () => ({
  parseContractError: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

jest.mock('@/lib/confirmApprovalSubmission', () => ({
  isOnChainApproved: (phase: string) =>
    phase === 'confirmed' || phase === 'event_lag',
  submitAndConfirmApproval: (...a: unknown[]) => mockSubmitAndConfirm(...a),
}));

function seed(
  playerId: string,
  status: ApprovalIntent['status'] = 'pending',
  validator = VALIDATOR,
): ApprovalIntent {
  const intent: ApprovalIntent = {
    idempotencyKey: `${playerId}:m1:${validator}`,
    playerId,
    milestone: 'm1',
    validator,
    status,
    queuedAt: NOW,
    updatedAt: NOW,
    retryCount: 0,
  };
  store.push(intent);
  return intent;
}

describe('useApprovalQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    store = [];
    mockAvailable.mockReturnValue(true);
    mockGetMilestoneHistory.mockResolvedValue([]);
    mockGetPlayer.mockResolvedValue({ progressLevel: 1 });
    mockSubmitAndConfirm.mockResolvedValue({ phase: 'confirmed', hash: 'abc' });
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('loads existing intents for the validator only', async () => {
    seed('p1');
    seed('p2', 'confirmed');
    seed('p3', 'pending', 'GOTHER');

    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.intents.map((i) => i.playerId)).toEqual(['p1', 'p2']);
    expect(result.current.pending.map((i) => i.playerId)).toEqual(['p1']);
    expect(result.current.terminal.map((i) => i.playerId)).toEqual(['p2']);
    expect(result.current.flushing).toBe(false);
    expect(result.current.flushError).toBeNull();
  });

  it('returns an empty loaded state without a validator or queue support', async () => {
    seed('p1');
    const { result, rerender } = renderHook(
      ({ v }: { v: string | null }) => useApprovalQueue(v),
      { initialProps: { v: null as string | null } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.intents).toEqual([]);

    mockAvailable.mockReturnValue(false);
    rerender({ v: VALIDATOR });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.intents).toEqual([]);
  });

  it('exposes createKey', async () => {
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await expect(
      result.current.createKey({
        playerId: 'p1',
        milestone: 'm1',
        validator: VALIDATOR,
      }),
    ).resolves.toBe(`p1:m1:${VALIDATOR}`);
  });

  it('enqueue adds an intent and updates state', async () => {
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let intent: ApprovalIntent | undefined;
    await act(async () => {
      intent = await result.current.enqueue({ playerId: 'p1', milestone: 'm1' });
    });

    expect(intent?.queuedAt).toBe(NOW);
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0].playerId).toBe('p1');
  });

  it('enqueue rejects when no wallet is connected', async () => {
    const { result } = renderHook(() => useApprovalQueue(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await expect(
      result.current.enqueue({ playerId: 'p1', milestone: 'm1' }),
    ).rejects.toThrow('Wallet not connected');
  });

  it('enqueueMany queues every item', async () => {
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      const queued = await result.current.enqueueMany([
        { playerId: 'p1', milestone: 'm1' },
        { playerId: 'p2', milestone: 'm1' },
      ]);
      expect(queued).toHaveLength(2);
    });

    expect(result.current.pending).toHaveLength(2);
  });

  it('flush confirms a pending intent on success', async () => {
    seed('p1');
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(mockSubmitAndConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.terminal).toHaveLength(1);
    expect(result.current.terminal[0]).toMatchObject({
      status: 'confirmed',
      txHash: 'abc',
      retryCount: 1,
    });
    expect(result.current.flushing).toBe(false);
  });

  it('flush marks an intent failed when the submission is not approved', async () => {
    seed('p1');
    mockSubmitAndConfirm.mockResolvedValue({
      phase: 'failed',
      hash: 'h1',
      message: 'Submission failed',
    });
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pending[0]).toMatchObject({
      status: 'failed',
      errorReason: 'Submission failed',
    });
  });

  it('flush marks an intent invalid when the player is already at max level', async () => {
    seed('p1');
    mockGetPlayer.mockResolvedValue({ progressLevel: 3 });
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(mockSubmitAndConfirm).not.toHaveBeenCalled();
    expect(result.current.terminal[0].status).toBe('invalid');
  });

  it('flush marks an intent failed on a transient error', async () => {
    seed('p1');
    mockSubmitAndConfirm.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pending[0]).toMatchObject({
      status: 'failed',
      errorReason: 'network down',
    });
  });

  it('flush skips duplicates already approved on-chain', async () => {
    seed('p1');
    mockGetMilestoneHistory.mockResolvedValue([
      { description: 'm1', validator: VALIDATOR },
    ]);
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(mockSubmitAndConfirm).not.toHaveBeenCalled();
    expect(result.current.terminal[0].status).toBe('confirmed');
  });

  it('flush surfaces a flushError when reading the queue fails', async () => {
    seed('p1');
    const queue = jest.requireMock('@/lib/approvalQueue');
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    queue.getApprovalIntents.mockRejectedValueOnce(new Error('idb broke'));
    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.flushError).toBe('idb broke');
    expect(result.current.flushing).toBe(false);
  });

  it('flush does nothing while offline', async () => {
    seed('p1');
    Object.defineProperty(window.navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(mockSubmitAndConfirm).not.toHaveBeenCalled();
    expect(result.current.pending).toHaveLength(1);
  });

  it('dismiss removes an intent', async () => {
    const intent = seed('p1', 'confirmed');
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.dismiss(intent.idempotencyKey);
    });

    expect(result.current.intents).toEqual([]);
  });

  it('refresh reloads and the online event triggers a refresh', async () => {
    const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.intents).toEqual([]);

    seed('p1');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.intents).toHaveLength(1));

    seed('p2');
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.intents).toHaveLength(2);
  });

  it('refreshes on APPROVAL_SYNC_READY messages and ignores others', async () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const sw = {
      addEventListener: jest.fn((t: string, cb: (e: MessageEvent) => void) => {
        listeners[t] = cb;
      }),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: sw,
      configurable: true,
    });

    try {
      const { result } = renderHook(() => useApprovalQueue(VALIDATOR));
      await waitFor(() => expect(result.current.loaded).toBe(true));

      seed('p1');
      await act(async () => {
        listeners.message({ data: { type: 'OTHER' } } as MessageEvent);
      });
      expect(result.current.intents).toEqual([]);

      await act(async () => {
        listeners.message({
          data: { type: 'APPROVAL_SYNC_READY' },
        } as MessageEvent);
      });
      await waitFor(() => expect(result.current.intents).toHaveLength(1));
    } finally {
      delete (window.navigator as unknown as Record<string, unknown>)
        .serviceWorker;
    }
  });

  it('removes its listeners on unmount', async () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const sw = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: sw,
      configurable: true,
    });

    try {
      const { result, unmount } = renderHook(() =>
        useApprovalQueue(VALIDATOR),
      );
      await waitFor(() => expect(result.current.loaded).toBe(true));
      unmount();

      expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(sw.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    } finally {
      removeSpy.mockRestore();
      delete (window.navigator as unknown as Record<string, unknown>)
        .serviceWorker;
    }
  });
});
