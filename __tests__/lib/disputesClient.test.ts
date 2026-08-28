import {
  fetchMyDisputes,
  fetchDisputeQueue,
  createDispute,
  decideDispute,
} from '@/lib/disputesClient';
import type { MilestoneDispute } from '@/types';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

const DISPUTE: MilestoneDispute = {
  id: 1,
  playerId: 'player-1',
  playerWallet: 'GPLAYER',
  milestoneId: 'milestone-1',
  milestoneDescription: 'Scored a hat-trick',
  reason: 'Video evidence attached',
  status: 'pending',
  createdAt: 1_700_000_000_000,
  decidedAt: null,
  decidedBy: null,
  resolutionNote: null,
  revokeTxHash: null,
};

describe('fetchMyDisputes', () => {
  it('GETs /api/disputes and returns the parsed list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [DISPUTE],
    });

    const result = await fetchMyDisputes();

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes');
    expect(result).toEqual([DISPUTE]);
  });

  it('throws a fixed error message when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(fetchMyDisputes()).rejects.toThrow(
      'Failed to fetch disputes',
    );
  });

  it('propagates a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetchMyDisputes()).rejects.toThrow('network down');
  });
});

describe('fetchDisputeQueue', () => {
  it('GETs /api/disputes without a query string when no status is given', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await fetchDisputeQueue();

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes');
  });

  it('appends ?status= when a status filter is given', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [DISPUTE],
    });

    const result = await fetchDisputeQueue('pending');

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes?status=pending');
    expect(result).toEqual([DISPUTE]);
  });

  it('throws a fixed error message when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(fetchDisputeQueue('upheld')).rejects.toThrow(
      'Failed to fetch dispute queue',
    );
  });
});

describe('createDispute', () => {
  const params = {
    playerId: 'player-1',
    milestoneId: 'milestone-1',
    milestoneDescription: 'Scored a hat-trick',
    reason: 'Video evidence attached',
  };

  it('POSTs the params as JSON and returns the created dispute', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => DISPUTE,
    });

    const result = await createDispute(params);

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    expect(result).toEqual(DISPUTE);
  });

  it('throws the server-provided error message on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Milestone already disputed' }),
    });

    await expect(createDispute(params)).rejects.toThrow(
      'Milestone already disputed',
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(createDispute(params)).rejects.toThrow(
      'Failed to create dispute',
    );
  });

  it('falls back to a generic message when the error body has no `error` field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await expect(createDispute(params)).rejects.toThrow(
      'Failed to create dispute',
    );
  });
});

describe('decideDispute', () => {
  it('PATCHes /api/disputes/:id/decide with the decision payload', async () => {
    const decision = {
      status: 'upheld' as const,
      resolutionNote: 'Confirmed via video',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...DISPUTE, ...decision }),
    });

    const result = await decideDispute(1, decision);

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes/1/decide', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    });
    expect(result.status).toBe('upheld');
  });

  it('includes a revokeTxHash for a reversed decision', async () => {
    const decision = {
      status: 'reversed' as const,
      resolutionNote: 'Insufficient evidence',
      revokeTxHash: 'abc123',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...DISPUTE, ...decision }),
    });

    await decideDispute(42, decision);

    expect(mockFetch).toHaveBeenCalledWith('/api/disputes/42/decide', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    });
  });

  it('throws the server-provided error message on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Dispute already decided' }),
    });

    await expect(
      decideDispute(1, { status: 'upheld' }),
    ).rejects.toThrow('Dispute already decided');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(
      decideDispute(1, { status: 'reversed' }),
    ).rejects.toThrow('Failed to decide dispute');
  });
});
