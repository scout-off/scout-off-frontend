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

/** Minimal shape for a player_contacted event */
function makeContactedEvent(scout: string, id = 1) {
  return {
    id,
    type: 'player_contacted' as const,
    playerId: 'player-1',
    scout,
    validator: null,
    ledger: 100,
    timestamp: 1000,
    data: {},
  };
}

/** Minimal shape for a non-contact event */
function makeOtherEvent(id = 99) {
  return {
    id,
    type: 'milestone_approved' as const,
    playerId: 'player-1',
    scout: null,
    validator: 'GVAL',
    ledger: 50,
    timestamp: 500,
    data: {},
  };
}

describe('hasPaidForContact', () => {
  describe('single-page results', () => {
    it('returns true when the matching scout has a player_contacted event', async () => {
      const fetchEvents = jest.fn().mockResolvedValue({
        events: [makeContactedEvent('GSCOUT1')],
        nextCursor: null,
      });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(true);
    });

    it('returns false when the player has no events at all', async () => {
      const fetchEvents = jest.fn().mockResolvedValue({
        events: [],
        nextCursor: null,
      });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(false);
    });

    it('returns false when the contacted event belongs to a different scout', async () => {
      const fetchEvents = jest.fn().mockResolvedValue({
        events: [makeContactedEvent('GOTHER_SCOUT')],
        nextCursor: null,
      });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(false);
    });

    it('returns false when only non-contact events are present', async () => {
      const fetchEvents = jest.fn().mockResolvedValue({
        events: [makeOtherEvent()],
        nextCursor: null,
      });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(false);
    });

    it('returns true when matching event is among multiple events', async () => {
      const fetchEvents = jest.fn().mockResolvedValue({
        events: [
          makeOtherEvent(1),
          makeContactedEvent('GOTHER_SCOUT', 2),
          makeContactedEvent('GSCOUT1', 3),
        ],
        nextCursor: null,
      });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(true);
    });
  });

  describe('pagination', () => {
    it('follows nextCursor when the match is on the second page', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValueOnce({
          events: [makeContactedEvent('GOTHER', 1)],
          nextCursor: 100,
        })
        .mockResolvedValueOnce({
          events: [makeContactedEvent('GSCOUT1', 2)],
          nextCursor: null,
        });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(true);
      expect(fetchEvents).toHaveBeenCalledTimes(2);
    });

    it('passes the cursor from the previous page as the `before` param', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValueOnce({ events: [], nextCursor: 42 })
        .mockResolvedValueOnce({
          events: [makeContactedEvent('GSCOUT1')],
          nextCursor: null,
        });

      await hasPaidForContact('GSCOUT1', 'player-1', { fetchEvents });

      expect(fetchEvents).toHaveBeenNthCalledWith(2, 'player-1', {
        type: 'player_contacted',
        limit: expect.any(Number),
        before: 42,
      });
    });

    it('returns false after exhausting all pages without finding a match', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValueOnce({ events: [makeContactedEvent('GOTHER')], nextCursor: 10 })
        .mockResolvedValueOnce({ events: [], nextCursor: null });

      const result = await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
      });

      expect(result).toBe(false);
    });
  });

  describe('options', () => {
    it('uses the provided limit option', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValue({ events: [], nextCursor: null });

      await hasPaidForContact('GSCOUT1', 'player-1', {
        fetchEvents,
        limit: 50,
      });

      expect(fetchEvents).toHaveBeenCalledWith(
        'player-1',
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('defaults the limit to 200', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValue({ events: [], nextCursor: null });

      await hasPaidForContact('GSCOUT1', 'player-1', { fetchEvents });

      expect(fetchEvents).toHaveBeenCalledWith(
        'player-1',
        expect.objectContaining({ limit: 200 }),
      );
    });

    it('always queries for player_contacted event type', async () => {
      const fetchEvents = jest
        .fn()
        .mockResolvedValue({ events: [], nextCursor: null });

      await hasPaidForContact('GSCOUT1', 'player-1', { fetchEvents });

      expect(fetchEvents).toHaveBeenCalledWith(
        'player-1',
        expect.objectContaining({ type: 'player_contacted' }),
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors thrown by fetchEvents to the caller', async () => {
      const fetchEvents = jest
        .fn()
        .mockRejectedValue(new Error('indexer unavailable'));

      await expect(
        hasPaidForContact('GSCOUT1', 'player-1', { fetchEvents }),
      ).rejects.toThrow('indexer unavailable');
    });
  });
});
