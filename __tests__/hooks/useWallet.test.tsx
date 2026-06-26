import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  WalletProvider,
  useWalletContext as useWallet,
} from '@/context/WalletContext';

// Mock @albedo-link/intent (requires browser fetch at module load time)
jest.mock('@albedo-link/intent', () => ({
  albedo: {
    publicKey: jest.fn(),
    tx: jest.fn(),
  },
}));

// Mock @lobstrco/signer-extension-api
jest.mock('@lobstrco/signer-extension-api', () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
}));

// Mock @stellar/freighter-api
jest.mock('@stellar/freighter-api', () => ({
  getPublicKey: jest.fn(),
  isConnected: jest.fn(),
  signTransaction: jest.fn(),
}));

// Mock @/lib/stellar
jest.mock('@/lib/stellar', () => ({
  NETWORK: 'Test SDF Network ; September 2015',
}));

// Mock swr so we can spy on the global mutate
jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return { ...actual, mutate: jest.fn() };
});

import {
  getPublicKey,
  isConnected,
  signTransaction,
} from '@stellar/freighter-api';
import { mutate as swrMutate } from 'swr';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

describe('useWallet', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
    localStorage.setItem('scoutoff_wallet_provider', 'freighter');
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('session is restored from /api/auth/session on mount', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: mockPublicKey }),
      })
      // balance fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ asset_type: 'native', balance: '10.0000000' }] }),
      });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/session');
    expect(result.current.publicKey).toBe(mockPublicKey);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('isRestoringSession is true during restore and false after', async () => {
    let resolveSession: (v: unknown) => void;
    const sessionPromise = new Promise((res) => { resolveSession = res; });

    (global.fetch as jest.Mock).mockReturnValueOnce(sessionPromise);

    const { result } = renderHook(() => useWallet(), { wrapper });

    // Still restoring before fetch resolves
    expect(result.current.isRestoringSession).toBe(true);

    await act(async () => {
      resolveSession!({ ok: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isRestoringSession).toBe(false);
  });

  test('isRestoringSession is false after successful session restore', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: mockPublicKey }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ asset_type: 'native', balance: '5.0000000' }] }),
      });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isRestoringSession).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('connect() sets wallet address on successful authentication', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const mockChallengeXdr = 'AAAAA...';
    const mockSignedXdr = 'BBBBB...';

    (isConnected as jest.Mock).mockResolvedValue(true);
    (getPublicKey as jest.Mock).mockResolvedValue(mockPublicKey);
    (signTransaction as jest.Mock).mockResolvedValue(mockSignedXdr);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false }) // session restoration on mount (no active session)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: mockChallengeXdr }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(mockPublicKey);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('connect() throws error when Freighter is not installed', async () => {
    (isConnected as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useWallet(), { wrapper });

    await expect(act(async () => result.current.connect())).rejects.toThrow(
      'freighter is not installed',
    );

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('disconnect() clears wallet address', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    // First connect to set some state
    (isConnected as jest.Mock).mockResolvedValue(true);
    (getPublicKey as jest.Mock).mockResolvedValue(
      'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
    );
    (signTransaction as jest.Mock).mockResolvedValue('signed');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: 'challenge' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).not.toBeNull();

    // Now disconnect
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('disconnect() clears SWR cache', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(swrMutate).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      { revalidate: false },
    );
  });

  test('balanceError is set when Horizon returns a server error', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: mockPublicKey }),
      })
      // Horizon 500
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.xlmBalance).toBeNull();
    expect(result.current.balanceError).toMatch(/Horizon error/);
  });

  test('xlmBalance is "0.00" for a 404 unfunded account (not an error)', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: mockPublicKey }),
      })
      // Horizon 404 — unfunded account
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.xlmBalance).toBe('0.00');
    expect(result.current.balanceError).toBeNull();
  });
});
