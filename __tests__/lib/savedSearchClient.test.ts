import {
  fetchSavedSearches,
  saveSearch,
  removeSavedSearch,
  renameSavedSearch,
  markSavedSearchViewed,
  SavedSearchConflictError,
} from '@/lib/savedSearchClient';
import type { PlayerFilter, SavedSearch } from '@/types';

const filter: PlayerFilter = {
  region: 'EU',
  position: 'Forward',
  minLevel: 5,
};

const savedSearch: SavedSearch = {
  id: 1,
  name: 'EU Forwards',
  filter,
  version: 1,
  createdAt: 1_700_000_000,
  lastViewedAt: 0,
};

function mockFetchResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('lib/savedSearchClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('fetchSavedSearches', () => {
    it("lists a scout's saved searches", async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(mockFetchResponse([savedSearch]));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchSavedSearches();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/saved-searches');
      expect(result).toEqual([savedSearch]);
    });
  });

  describe('saveSearch', () => {
    it('creates a saved search', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(mockFetchResponse(savedSearch));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await saveSearch('EU Forwards', filter);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/saved-searches');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({
        name: 'EU Forwards',
        filter,
      });
      expect(result).toEqual(savedSearch);
    });
  });

  describe('removeSavedSearch', () => {
    it('deletes a saved search', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(mockFetchResponse(null));
      global.fetch = fetchMock as unknown as typeof fetch;

      await removeSavedSearch(savedSearch.id, savedSearch.version);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain(`/api/saved-searches/${savedSearch.id}`);
      expect(init?.method).toBe('DELETE');
    });
  });

  describe('renameSavedSearch', () => {
    it('renames a saved search', async () => {
      const renamed = { ...savedSearch, name: 'Renamed', version: 2 };
      const fetchMock = jest
        .fn()
        .mockResolvedValue(mockFetchResponse(renamed));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await renameSavedSearch(
        savedSearch.id,
        'Renamed',
        savedSearch.version,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain(`/api/saved-searches/${savedSearch.id}`);
      expect(init?.method).toBe('PATCH');
      expect(result).toEqual(renamed);
    });
  });

  describe('markSavedSearchViewed', () => {
    it('marks a saved search as viewed', async () => {
      const viewed = { ...savedSearch, lastViewedAt: 1_700_000_100 };
      const fetchMock = jest
        .fn()
        .mockResolvedValue(mockFetchResponse(viewed));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await markSavedSearchViewed(
        savedSearch.id,
        savedSearch.version,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(viewed);
    });
  });

  describe('failed requests', () => {
    it('surfaces a non-OK response to the caller', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          mockFetchResponse({ message: 'boom' }, { ok: false, status: 500 }),
        );
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(fetchSavedSearches()).rejects.toThrow();
    });

    it('surfaces a rejected fetch to the caller', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValue(new Error('network down'));
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(fetchSavedSearches()).rejects.toThrow('network down');
    });

    it('surfaces a conflict as SavedSearchConflictError', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          mockFetchResponse(
            { message: 'conflict' },
            { ok: false, status: 409 },
          ),
        );
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(
        renameSavedSearch(savedSearch.id, 'Renamed', savedSearch.version),
      ).rejects.toBeInstanceOf(SavedSearchConflictError);
    });
  });
});
