import {
  addToWatchlist,
  fetchWatchlist,
  removeFromWatchlist,
} from '@/lib/watchlistClient';
import type { WatchlistEntry } from '@/types';

describe('lib/watchlistClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetch(
    response: Partial<Response> & { json?: () => Promise<unknown> },
  ) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...response,
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  describe('fetchWatchlist', () => {
    it("lists a scout's watchlist", async () => {
      const entries: WatchlistEntry[] = [
        {
          id: 'w1',
          scoutWallet: 'GSCOUT',
          playerId: 'p1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      const fetchMock = mockFetch({ json: async () => entries });

      const result = await fetchWatchlist();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/watchlist',
        expect.anything(),
      );
      expect(result).toEqual(entries);
    });
  });

  describe('addToWatchlist', () => {
    it('adds a player to the watchlist', async () => {
      const entry: WatchlistEntry = {
        id: 'w2',
        scoutWallet: 'GSCOUT',
        playerId: 'p2',
        createdAt: '2024-01-02T00:00:00.000Z',
      };
      const fetchMock = mockFetch({ json: async () => entry });

      const result = await addToWatchlist('p2');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/watchlist',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual(entry);
    });
  });

  describe('removeFromWatchlist', () => {
    it('removes a player from the watchlist', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      await removeFromWatchlist('w2');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/watchlist/w2',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('failed requests', () => {
    it('surfaces a failed fetch to the caller', async () => {
      mockFetch({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      });

      await expect(fetchWatchlist()).rejects.toThrow();
    });

    it('surfaces a failed add to the caller', async () => {
      mockFetch({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad request' }),
      });

      await expect(addToWatchlist('p3')).rejects.toThrow();
    });

    it('surfaces a failed remove to the caller', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
      });

      await expect(removeFromWatchlist('missing')).rejects.toThrow();
    });
  });
});
