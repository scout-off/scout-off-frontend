import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  WalletProvider,
  useWalletContext as useWallet,
} from '@/context/WalletContext';
import { walletAdapters } from '@/lib/walletAdapters';

jest.mock('@/lib/walletAdapters', () => ({
  walletAdapters: {
    freighter: { getPublicKey: jest.fn(), signTransaction: jest.fn() },
    albedo: { getPublicKey: jest.fn(), signTransaction: jest.fn() },
    lobstr: { getPublicKey: jest.fn(), signTransaction: jest.fn() },
  },
}));

jest.mock('@/lib/stellar', () => ({
  rpc: { sendTransaction: jest.fn(), getAccount: jest.fn() },
  NETWORK: 'Test SDF Network ; September 2015',
}));

jest.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: { fromXDR: jest.fn(() => ({})) },
}));

jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return { ...actual, mutate: jest.fn() };
});

import { mutate as swrMutate } from 'swr';

const PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const CHALLENGE_XDR = 'challenge-xdr';
const SIGNED_XDR = 'signed-xdr';

const freighter = walletAdapters.freighter as jest.Mocked<
  typeof walletAdapters.freighter
>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

describe('useWallet', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
    });
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.signTransaction.mockResolvedValue(SIGNED_XDR);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('session is restored from localStorage on mount', async () => {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('isRestoringSession is true during restore and false after', async () => {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    let resolveAccount: (v: unknown) => void;
    const accountPromise = new Promise((res) => {
      resolveAccount = res;
    });
    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockReturnValueOnce(accountPromise);

    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current.isRestoringSession).toBe(true);

    await act(async () => {
      resolveAccount!({
        balances: [{ asset_type: 'native', balance: '10.0000000' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isRestoringSession).toBe(false);
  });

  test('isRestoringSession is false after successful session restore', async () => {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isRestoringSession).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('connect() sets wallet address on successful authentication', async () => {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: CHALLENGE_XDR }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('connectWithProvider() throws error when wallet adapter throws', async () => {
    freighter.getPublicKey.mockRejectedValue(
      new Error('Freighter not installed'),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await expect(
      act(async () => result.current.connectWithProvider('freighter')),
    ).rejects.toThrow('Freighter not installed');

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('disconnect() clears wallet address', async () => {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.publicKey).toBe(PUBLIC_KEY);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('disconnect() clears SWR cache', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    act(() => {
      result.current.disconnect();
    });

    expect(swrMutate).toHaveBeenCalledWith(expect.any(Function), undefined, {
      revalidate: false,
    });
  });

  test('balanceError is set when rpc.getAccount throws a server error', async () => {
    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockRejectedValue(new Error('Network error'));

    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.xlmBalance).toBeNull();
    expect(result.current.balanceError).toMatch(/Network error/);
  });

  test('xlmBalance is "0.0000000" when no native balance found', async () => {
    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockResolvedValue({ balances: [] });

    localStorage.setItem(
      'wallet_session',
      JSON.stringify({ publicKey: PUBLIC_KEY, provider: 'freighter' }),
    );

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(result.current.xlmBalance).toBe('0.0000000'));
    expect(result.current.balanceError).toBeNull();
  });
});
