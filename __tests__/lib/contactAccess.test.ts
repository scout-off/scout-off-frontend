import { hasPaidForContact } from '@/lib/contactAccess';
import type { EventQueryParams, IndexedEventsPage } from '@/lib/indexerClient';

describe('hasPaidForContact', () => {
  it('finds a payment beyond the former ten-page limit', async () => {
    let page = 0;
    const fetchEvents = jest.fn(
      async (
        _playerId: string,
        _params?: EventQueryParams,
      ): Promise<IndexedEventsPage> => {
        page += 1;
        return {
          events:
            page === 11
              ? [
                  {
                    id: 1,
                    type: 'player_contacted',
                    playerId: 'player-1',
                    scout: 'scout-1',
                    validator: null,
                    ledger: 1,
                    timestamp: 1,
                    data: {},
                  },
                ]
              : [],
          nextCursor: page === 11 ? null : page,
        };
      },
    );

    await expect(
      hasPaidForContact('scout-1', 'player-1', { fetchEvents }),
    ).resolves.toBe(true);
    expect(fetchEvents).toHaveBeenCalledTimes(11);
  });

  it('throws when the indexer repeats a cursor', async () => {
    const fetchEvents = jest.fn(
      async (
        _playerId: string,
        _params?: EventQueryParams,
      ): Promise<IndexedEventsPage> => ({ events: [], nextCursor: 1 }),
    );

    await expect(
      hasPaidForContact('scout-1', 'player-1', { fetchEvents }),
    ).rejects.toThrow('Indexer repeated a player events cursor');
  });
});