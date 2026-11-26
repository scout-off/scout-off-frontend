jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
  getMilestoneHistory: jest.fn(),
  getSubscription: jest.fn(),
}));
jest.mock('@/lib/indexerClient', () => ({
  fetchEvents: jest.fn(),
  fetchPlayerEvents: jest.fn(),
  fetchValidatorEvents: jest.fn(),
}));

import {
  collectOnChainData,
  MAX_EVENTS_PER_GROUP,
  type OnChainDeps,
} from '@/lib/onChainDataCollection';
import type { IndexedEvent } from '@/lib/indexerClient';

const WALLET = 'GAFQHU6AJVT4SWCB4L2BQQ6LDERANZKUBWKEWMD4ZI57TPTFVWSWYYEX';
const VALIDATOR = 'GCHIMRQHESFSACX647SY5UEPMJA5XBIVK7FIJYU4LQ7QPHBD5W4GZXXI';

function event(overrides: Partial<IndexedEvent>): IndexedEvent {
  return {
    id: 1,
    type: 'milestone_approved',
    playerId: WALLET,
    scout: null,
    validator: VALIDATOR,
    ledger: 100,
    timestamp: 1_700_000_000,
    data: {},
    ...overrides,
  };
}

const emptyPage = { events: [], nextCursor: null };

function deps(overrides: Partial<OnChainDeps> = {}): OnChainDeps {
  return {
    getPlayer: jest.fn().mockResolvedValue(null),
    getMilestoneHistory: jest.fn().mockResolvedValue([]),
    getSubscription: jest.fn().mockResolvedValue(null),
    fetchPlayerEvents: jest.fn().mockResolvedValue(emptyPage),
    fetchValidatorEvents: jest.fn().mockResolvedValue(emptyPage),
    fetchEvents: jest.fn().mockResolvedValue(emptyPage),
    ...overrides,
  };
}

describe('collectOnChainData', () => {
  it('exports the player record, milestones and player events for a player', async () => {
    const d = deps({
      getPlayer: jest.fn().mockResolvedValue({
        id: WALLET,
        wallet: WALLET,
        vitals: { name: 'A' },
        milestones: [{ id: 'ignored' }],
        progressLevel: 1,
        ipfsHash: 'cid',
        createdAt: 1,
      }),
      getMilestoneHistory: jest.fn().mockResolvedValue([
        {
          id: 'm1',
          description: 'Signed',
          evidenceHash: 'cid-1',
          validator: VALIDATOR,
          timestamp: 1_700_000_000,
        },
      ]),
      fetchPlayerEvents: jest.fn().mockResolvedValue({
        events: [event({ data: { txHash: 'ab'.repeat(32) } })],
        nextCursor: null,
      }),
    });

    const result = await collectOnChainData(WALLET, d);

    expect(result.publicLedgerData).toBe(true);
    expect(result.accountExplorerUrl).toContain(WALLET);
    expect(result.player).toMatchObject({ status: 'ok' });
    expect(
      result.player.status === 'ok' && result.player.data,
    ).not.toHaveProperty('milestones');
    expect(result.milestones).toEqual({
      status: 'ok',
      data: [
        expect.objectContaining({
          id: 'm1',
          validator: VALIDATOR,
          txHash: 'ab'.repeat(32),
          explorerUrl: expect.stringContaining(`/tx/${'ab'.repeat(32)}`),
        }),
      ],
    });
    expect(result.events.asPlayer).toMatchObject({
      status: 'ok',
      data: [{ type: 'milestone_approved', ledger: 100 }],
    });
  });

  it('exports subscription and scout-side events for a scout', async () => {
    const d = deps({
      getPlayer: jest
        .fn()
        .mockRejectedValue(new Error('HostError: Error(Contract, #3)')),
      getSubscription: jest
        .fn()
        .mockResolvedValue({ scout: WALLET, tier: 'Pro', expiresAt: 9 }),
      fetchEvents: jest.fn().mockImplementation(async ({ type }) => ({
        events: [
          event({ type, scout: WALLET, validator: null, ledger: 5 }),
          event({ type, scout: 'GSOMEONEELSE', validator: null }),
        ],
        nextCursor: null,
      })),
    });

    const result = await collectOnChainData(WALLET, d);

    expect(result.player).toEqual({ status: 'ok', data: null });
    expect(result.milestones).toEqual({ status: 'ok', data: [] });
    expect(result.subscription).toEqual({
      status: 'ok',
      data: { scout: WALLET, tier: 'Pro', expiresAt: 9 },
    });
    expect(result.events.asScout.status).toBe('ok');
    if (result.events.asScout.status === 'ok') {
      expect(result.events.asScout.data).toHaveLength(3);
      expect(result.events.asScout.data.every((e) => e.scout === WALLET)).toBe(
        true,
      );
      expect(result.events.asScout.data[0].explorerUrl).toContain('/ledger/5');
    }
  });

  it('marks parts unavailable on RPC and indexer failures instead of throwing', async () => {
    const d = deps({
      getPlayer: jest.fn().mockRejectedValue(new Error('RPC timeout')),
      getSubscription: jest.fn().mockRejectedValue(new Error('RPC timeout')),
      fetchPlayerEvents: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      fetchValidatorEvents: jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')),
      fetchEvents: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const result = await collectOnChainData(WALLET, d);

    expect(result.player).toEqual({
      status: 'unavailable',
      reason: 'RPC timeout',
    });
    expect(result.milestones.status).toBe('unavailable');
    expect(result.subscription.status).toBe('unavailable');
    expect(result.events.asPlayer).toEqual({
      status: 'unavailable',
      reason: 'ECONNREFUSED',
    });
    expect(result.events.asValidator.status).toBe('unavailable');
    expect(result.events.asScout.status).toBe('unavailable');
  });

  it('caps paginated indexer reads and flags truncation', async () => {
    const fetchValidatorEvents = jest
      .fn()
      .mockImplementation(async ({ before }: { before?: number }) => ({
        events: Array.from({ length: 200 }, (_, i) =>
          event({ id: i, ledger: (before ?? 10_000) - i }),
        ),
        nextCursor: (before ?? 10_000) - 200,
      }));

    const result = await collectOnChainData(
      WALLET,
      deps({ fetchValidatorEvents }),
    );

    expect(fetchValidatorEvents).toHaveBeenCalledTimes(3);
    expect(result.events.asValidator).toMatchObject({
      status: 'ok',
      truncated: true,
    });
    if (result.events.asValidator.status === 'ok') {
      expect(result.events.asValidator.data).toHaveLength(MAX_EVENTS_PER_GROUP);
    }
  });
});
