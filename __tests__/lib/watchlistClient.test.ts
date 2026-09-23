/**
 * Unit tests for lib/watchlistClient.ts
 *
 * Covers:
 * - fetchWatchlist (listing a scout's watchlist)
 * - addToWatchlist (adding a player to the watchlist)
 * - removeFromWatchlist (removing a player from the watchlist)
 * - Error propagation when HTTP requests fail
 */

import {
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '@/lib/watchlistClient';
import type { WatchlistEntry } from '@/types';

// Mock fetchWithRetry so it passes through directly to the mocked global fetch
jest.mock('@/lib/fetchWithRetry', () => ({
  fetchWithRetry: (...args: unknown[]) =>
    (global.fetch as jest.Mock)(...(args as [RequestInfo, RequestInit?])),
}));

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

const MOCK_ENTRY: WatchlistEntry = {
  id: 1,
  scoutWallet: 'GSCOUT1234567890EXAMPLE',
  playerId: 'player-abc-123',
  createdAt: 1_700_000_000_000,
};

const MOCK_ENTRY_2: WatchlistEntry = {
  id: 2,
  scoutWallet: 'GSCOUT1234567890EXAMPLE',
  playerId: 'player-def-456',
  createdAt: 1_700_000_060_000,
};

// ── fetchWatchlist ────────────────────────────────────────────────────────────

describe('fetchWatchlist', () => {
  it('GETs /api/watchlist and returns parsed watchlist entries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [MOCK_ENTRY, MOCK_ENTRY_2],
    });

    const result = await fetchWatchlist();

    expect(mockFetch).toHaveBeenCalledWith('/api/watchlist');
    expect(result).toEqual([MOCK_ENTRY, MOCK_ENTRY_2]);
  });

  it('returns an empty array when the server returns an empty list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await fetchWatchlist();

    expect(mockFetch).toHaveBeenCalledWith('/api/watchlist');
    expect(result).toEqual([]);
  });

  it('throws an error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(fetchWatchlist()).rejects.toThrow('Failed to fetch watchlist');
    expect(mockFetch).toHaveBeenCalledWith('/api/watchlist');
  });

  it('propagates network rejections from the underlying fetch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network offline'));

    await expect(fetchWatchlist()).rejects.toThrow('Network offline');
  });
});

// ── addToWatchlist ────────────────────────────────────────────────────────────

describe('addToWatchlist', () => {
  it('POSTs /api/watchlist with JSON body and returns the created entry', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_ENTRY,
    });

    const result = await addToWatchlist('player-abc-123');

    expect(mockFetch).toHaveBeenCalledWith('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: 'player-abc-123' }),
    });
    expect(result).toEqual(MOCK_ENTRY);
  });

  it('throws an error when response is not ok (e.g. 400 bad request)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    await expect(addToWatchlist('invalid-player-id')).rejects.toThrow(
      'Failed to add to watchlist',
    );
  });

  it('propagates network rejections from the underlying fetch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

    await expect(addToWatchlist('player-abc-123')).rejects.toThrow(
      'Connection timeout',
    );
  });
});

// ── removeFromWatchlist ───────────────────────────────────────────────────────

describe('removeFromWatchlist', () => {
  it('DELETEs /api/watchlist with entry id in JSON body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
    });

    await removeFromWatchlist(1);

    expect(mockFetch).toHaveBeenCalledWith('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1 }),
    });
  });

  it('throws an error when response is not ok (e.g. 404 not found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(removeFromWatchlist(999)).rejects.toThrow(
      'Failed to remove from watchlist',
    );
  });

  it('propagates network rejections from the underlying fetch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));

    await expect(removeFromWatchlist(1)).rejects.toThrow('Fetch failed');
  });
});
