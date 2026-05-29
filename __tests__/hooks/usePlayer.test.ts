import { renderHook } from '@testing-library/react';
import { usePlayer } from '../../hooks/usePlayer';
import { getPlayer } from '../../lib/contract';

const waitForCustom = (cb: () => boolean): Promise<void> => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (cb()) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
};

jest.mock('../../lib/contract', () => ({
  getPlayer: jest.fn(),
}));

describe('usePlayer Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct default states and fetch player data', async () => {
    const mockPlayer = { id: 'test-wallet', name: 'CryptoKnight' };
    (getPlayer as jest.Mock).mockResolvedValue(mockPlayer);

    const { result } = renderHook(() => usePlayer('test-wallet'));

    expect(result.current.loading).toBe(true);
    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();

    await waitForCustom(() => !result.current.loading);

    expect(result.current.player).toEqual(mockPlayer);
    expect(result.current.error).toBeNull();
    expect(getPlayer).toHaveBeenCalledWith('test-wallet');
  });

  it('should handle errors gracefully if contract call fails', async () => {
    const mockError = new Error('Contract execution failed');
    (getPlayer as jest.Mock).mockRejectedValue(mockError);

    const { result } = renderHook(() => usePlayer('test-wallet'));

    await waitForCustom(() => !result.current.loading);

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBe('Contract execution failed');
  });

  it('should return null for an unknown player ID', async () => {
    // Explicitly casting the resolved value as any or null to satisfy compiler
    (getPlayer as jest.Mock).mockResolvedValue(null as any);

    const { result } = renderHook(() => usePlayer('unknown-wallet'));

    await waitForCustom(() => !result.current.loading);

    expect(result.current.player).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getPlayer).toHaveBeenCalledWith('unknown-wallet');
  });
});