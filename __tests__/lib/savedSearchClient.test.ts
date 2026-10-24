import {
  fetchSavedSearches,
  markSavedSearchViewed,
  removeSavedSearch,
  renameSavedSearch,
  saveSearch,
  SavedSearchConflictError,
} from '@/lib/savedSearchClient';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

jest.mock('@/lib/fetchWithRetry', () => ({
  ...jest.requireActual('@/lib/fetchWithRetry'),
  fetchWithRetry: jest.fn(),
}));

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<
  typeof fetchWithRetry
>;

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const SEARCH = {
  id: 1,
  name: 'Strikers',
  filter: { position: 'ST' },
  version: 3,
};

describe('savedSearchClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  describe('fetchSavedSearches', () => {
    it('GETs the list through fetchWithRetry', async () => {
      mockFetchWithRetry.mockResolvedValue(response([SEARCH]));
      await expect(fetchSavedSearches()).resolves.toEqual([SEARCH]);
      expect(mockFetchWithRetry).toHaveBeenCalledWith('/api/saved-searches');
    });

    it('throws on a non-2xx response', async () => {
      mockFetchWithRetry.mockResolvedValue(response({}, false, 500));
      await expect(fetchSavedSearches()).rejects.toThrow(
        'Failed to fetch saved searches',
      );
    });
  });

  describe('saveSearch', () => {
    it('POSTs the name and filter with a bare fetch', async () => {
      fetchMock.mockResolvedValue(response(SEARCH));
      await expect(saveSearch('Strikers', SEARCH.filter)).resolves.toEqual(
        SEARCH,
      );
      expect(fetchMock).toHaveBeenCalledWith('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Strikers', filter: SEARCH.filter }),
      });
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });

    it('throws on failure', async () => {
      fetchMock.mockResolvedValue(response({}, false, 400));
      await expect(saveSearch('x', {})).rejects.toThrow(
        'Failed to save search',
      );
    });
  });

  // The three versioned mutations share the same If-Match / 409 handling.
  describe.each([
    [
      'renameSavedSearch',
      (version?: number) => renameSavedSearch(1, 'New', version),
      'PATCH',
      { id: 1, name: 'New' },
      'Failed to rename saved search',
    ],
    [
      'markSavedSearchViewed',
      (version?: number) => markSavedSearchViewed(1, version),
      'PATCH',
      { id: 1, markViewed: true },
      'Failed to mark saved search viewed',
    ],
    [
      'removeSavedSearch',
      (version?: number) => removeSavedSearch(1, version),
      'DELETE',
      { id: 1 },
      'Failed to remove saved search',
    ],
  ] as const)('%s', (_name, call, method, body, failure) => {
    it('sends If-Match when a version is known', async () => {
      fetchMock.mockResolvedValue(response(SEARCH));
      await call(3);
      expect(fetchMock).toHaveBeenCalledWith('/api/saved-searches', {
        method,
        headers: { 'Content-Type': 'application/json', 'If-Match': '"3"' },
        body: JSON.stringify(body),
      });
    });

    it('omits If-Match without a version', async () => {
      fetchMock.mockResolvedValue(response(SEARCH));
      await call();
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('raises a conflict error carrying the server copy on 409', async () => {
      fetchMock.mockResolvedValue(
        response({ current: SEARCH, currentVersion: 4 }, false, 409),
      );
      const err = await call(3).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SavedSearchConflictError);
      expect(err).toMatchObject({ current: SEARCH, currentVersion: 4 });
    });

    it('still raises a conflict error when the 409 body is unreadable', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => {
          throw new Error('bad json');
        },
      } as unknown as Response);
      const err = await call(3).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SavedSearchConflictError);
      expect((err as SavedSearchConflictError).current).toBeUndefined();
    });

    it('throws a generic error on other failures', async () => {
      fetchMock.mockResolvedValue(response({}, false, 500));
      await expect(call(3)).rejects.toThrow(failure);
    });
  });
});
