import { renderHook, waitFor } from '@testing-library/react';
import { useComparePlayers } from '@/hooks/useComparePlayers';
import { fetchPlayerById } from '@/lib/playerClient';

jest.mock('@/lib/playerClient', () => ({
  fetchPlayerById: jest.fn(),
}));

const mockFetchPlayerById = fetchPlayerById as jest.MockedFunction<
  typeof fetchPlayerById
>;

describe('useComparePlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches multiple players by ID for comparison', async () => {
    mockFetchPlayerById.mockImplementation(async (id: string) => ({
      id,
      name: `Player ${id}`,
    }));

    const { result } = renderHook(() => useComparePlayers(['1', '2', '3']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchPlayerById).toHaveBeenCalledTimes(3);
    expect(mockFetchPlayerById).toHaveBeenCalledWith('1');
    expect(mockFetchPlayerById).toHaveBeenCalledWith('2');
    expect(mockFetchPlayerById).toHaveBeenCalledWith('3');
    expect(result.current.players).toEqual([
      { id: '1', name: 'Player 1' },
      { id: '2', name: 'Player 2' },
      { id: '3', name: 'Player 3' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('exposes a loading state while all players are being fetched', () => {
    mockFetchPlayerById.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useComparePlayers(['1', '2']));

    expect(result.current.loading).toBe(true);
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('resolves the other players when one ID is not found', async () => {
    mockFetchPlayerById.mockImplementation(async (id: string) => {
      if (id === '2') {
        throw new Error('Player not found');
      }
      return { id, name: `Player ${id}` };
    });

    const { result } = renderHook(() => useComparePlayers(['1', '2', '3']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.players).toEqual([
      { id: '1', name: 'Player 1' },
      { id: '3', name: 'Player 3' },
    ]);
    expect(result.current.error).not.toBeNull();
  });

  it('returns an empty result set without a network call for an empty ID list', async () => {
    const { result } = renderHook(() => useComparePlayers([]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchPlayerById).not.toHaveBeenCalled();
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
