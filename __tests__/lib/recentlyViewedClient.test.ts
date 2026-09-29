import {
  fetchRecentlyViewed,
  recordView,
  removeView,
} from '@/lib/recentlyViewedClient';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

jest.mock('@/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<
  typeof fetchWithRetry
>;

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('recentlyViewedClient', () => {
  const entry = { id: 1, playerId: 'p1', viewedAt: 1000 };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  describe('fetchRecentlyViewed', () => {
    it('GETs /api/recently-viewed and parses entries', async () => {
      mockFetchWithRetry.mockResolvedValue(response([entry]));
      await expect(fetchRecentlyViewed()).resolves.toEqual([entry]);
      expect(mockFetchWithRetry).toHaveBeenCalledWith('/api/recently-viewed');
    });

    it('throws on a non-2xx response', async () => {
      mockFetchWithRetry.mockResolvedValue(response({}, false, 500));
      await expect(fetchRecentlyViewed()).rejects.toThrow(
        'Failed to fetch recently viewed',
      );
    });
  });

  describe('recordView', () => {
    it('POSTs the player id and returns the updated entry', async () => {
      fetchMock.mockResolvedValue(response(entry));
      await expect(recordView('p1', 1000)).resolves.toEqual(entry);
      expect(fetchMock).toHaveBeenCalledWith('/api/recently-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'p1', viewedAt: 1000 }),
      });
    });

    it('throws on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(response({}, false, 401));
      await expect(recordView('p1', 1000)).rejects.toThrow(
        'Failed to record view',
      );
    });
  });

  describe('removeView', () => {
    it('DELETEs the entry by id', async () => {
      fetchMock.mockResolvedValue(response(null));
      await expect(removeView(1)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith('/api/recently-viewed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
      });
    });

    it('throws on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(response({}, false, 404));
      await expect(removeView(1)).rejects.toThrow('Failed to remove view');
    });
  });
});
