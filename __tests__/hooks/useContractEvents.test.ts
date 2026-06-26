import { renderHook, act, waitFor } from '@testing-library/react';
import { useContractEvents } from '@/hooks/useContractEvents';

const CONTRACT = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

function makeOp(id: string, fnHint = '') {
  return {
    id,
    paging_token: id,
    type: 'invoke_host_function',
    function: fnHint,
    created_at: '2026-01-01T00:00:00Z',
    transaction_hash: 'txhash_' + id,
  };
}

function mockFetch(records: object[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ _embedded: { records } }),
  } as Response);
}

describe('useContractEvents (polling fallback)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns empty events initially', () => {
    mockFetch([]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    expect(result.current.events).toEqual([]);
  });

  it('populates events after first successful poll', async () => {
    mockFetch([makeOp('1')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe('1');
  });

  it('maps invoke_host_function with register hint to player_registered', async () => {
    mockFetch([makeOp('2', 'register_player')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('player_registered');
  });

  it('maps invoke_host_function with trial hint to trial_offer_logged', async () => {
    mockFetch([makeOp('3', 'log_trial')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('trial_offer_logged');
  });

  it('defaults to milestone_approved for generic invoke_host_function', async () => {
    mockFetch([makeOp('4')]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].type).toBe('milestone_approved');
  });

  it('deduplicates events across polls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [makeOp('5')] } }),
    } as Response);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2));
    expect(result.current.events).toHaveLength(1);
  });

  it('prepends new events to the top of the list', async () => {
    global.fetch = (jest.fn() as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ _embedded: { records: [makeOp('6')] } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ _embedded: { records: [makeOp('7')] } }) } as Response);

    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events[0].id).toBe('7');
    expect(result.current.events[1].id).toBe('6');
  });

  it('ignores non-invoke_host_function operations', async () => {
    mockFetch([{ id: '8', type: 'payment', created_at: '' }]);
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1));
    expect(result.current.events).toHaveLength(0);
  });

  it('handles fetch errors silently without crashing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useContractEvents(CONTRACT));
    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1));
    expect(result.current.events).toHaveLength(0);
  });

  it('cleans up the polling interval on unmount', async () => {
    mockFetch([]);
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useContractEvents(CONTRACT));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
