import { renderHook, act, waitFor } from '@testing-library/react';
import useSWR from 'swr';
import { WalletProvider, useWalletContext } from '@/context/WalletContext';
import { walletAdapters } from '@/lib/walletAdapters';
import {
  cacheContactDetails,
  contactDetailsKey,
} from '@/lib/contactDetailsCache';
import type { ReactNode } from 'react';

jest.mock('@/lib/walletAdapters', () => ({
  walletAdapters: {
    freighter: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    albedo: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    lobstr: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
    ledger: {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    },
  },
}));

jest.mock('@/lib/stellar', () => ({
  rpc: { sendTransaction: jest.fn(), getAccount: jest.fn() },
  NETWORK: 'Test SDF Network ; September 2015',
}));

jest.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: { fromXDR: jest.fn(() => ({})) },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
}));

const PUBLIC_KEY = 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
const CHALLENGE_XDR = 'challenge-xdr';
const SIGNED_XDR = 'signed-xdr';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

function setupSep10() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transaction: CHALLENGE_XDR }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'jwt-token' }),
    });
}

describe('WalletContext', () => {
  const freighter = walletAdapters.freighter as jest.Mocked<
    typeof walletAdapters.freighter
  >;
  const albedo = walletAdapters.albedo as jest.Mocked<
    typeof walletAdapters.albedo
  >;
  const lobstr = walletAdapters.lobstr as jest.Mocked<
    typeof walletAdapters.lobstr
  >;
  const ledger = walletAdapters.ledger as jest.Mocked<
    typeof walletAdapters.ledger
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    freighter.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    freighter.signTransaction.mockResolvedValue(SIGNED_XDR);
    albedo.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    albedo.signTransaction.mockResolvedValue(SIGNED_XDR);
    lobstr.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    lobstr.signTransaction.mockResolvedValue(SIGNED_XDR);
    ledger.getPublicKey.mockResolvedValue(PUBLIC_KEY);
    ledger.signTransaction.mockResolvedValue(SIGNED_XDR);

    const { rpc } = jest.requireMock('@/lib/stellar');
    rpc.getAccount.mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    });
  });

  describe('connectWithProvider', () => {
    it('calls freighter adapter and completes SEP-10 flow', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });
      expect(freighter.getPublicKey).toHaveBeenCalled();
      expect(freighter.signTransaction).toHaveBeenCalledWith(
        CHALLENGE_XDR,
        expect.any(String),
      );
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.publicKey).toBe(PUBLIC_KEY);
    });

    it('calls albedo adapter for albedo provider', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('albedo');
      });
      expect(albedo.getPublicKey).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('calls lobstr adapter for lobstr provider', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('lobstr');
      });
      expect(lobstr.getPublicKey).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('calls ledger adapter for ledger provider', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('ledger');
      });
      expect(ledger.getPublicKey).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('sets isAuthenticated to true on success', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      expect(result.current.isAuthenticated).toBe(false);
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('throws and does not set isAuthenticated on adapter failure', async () => {
      freighter.getPublicKey.mockRejectedValue(
        new Error('Freighter not installed'),
      );
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await expect(
        act(async () => {
          await result.current.connectWithProvider('freighter');
        }),
      ).rejects.toThrow('Freighter not installed');
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('calls loadBalance after successful connect', async () => {
      setupSep10();
      const { rpc } = jest.requireMock('@/lib/stellar');
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });
      expect(rpc.getAccount).toHaveBeenCalledWith(PUBLIC_KEY);
      await waitFor(() =>
        expect(result.current.xlmBalance).toBe('100.0000000'),
      );
    });
  });

  describe('disconnect', () => {
    it('clears publicKey, isAuthenticated, xlmBalance, walletProvider, and localStorage', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });
      expect(result.current.isAuthenticated).toBe(true);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.publicKey).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.xlmBalance).toBeNull();
      expect(result.current.walletProvider).toBeNull();
      expect(localStorage.getItem('wallet_session')).toBeNull();
    });
  });

  describe('signAndSubmit', () => {
    it('throws when no wallet is connected', async () => {
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await expect(
        act(async () => {
          await result.current.signAndSubmit('some-xdr');
        }),
      ).rejects.toThrow('Wallet not connected');
    });

    it('calls the correct adapter and submits to RPC', async () => {
      setupSep10();
      const { rpc } = jest.requireMock('@/lib/stellar');
      rpc.sendTransaction.mockResolvedValue({ hash: 'tx-hash' });
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });

      await act(async () => {
        await result.current.signAndSubmit('tx-xdr');
      });

      expect(freighter.signTransaction).toHaveBeenCalledWith(
        'tx-xdr',
        expect.any(String),
      );
      expect(rpc.sendTransaction).toHaveBeenCalled();
    });
  });

  describe('signOnly', () => {
    it('throws when no wallet is connected', async () => {
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await expect(
        act(async () => {
          await result.current.signOnly('some-xdr');
        }),
      ).rejects.toThrow('Wallet not connected');
    });

    it('signs via the adapter without submitting to RPC', async () => {
      setupSep10();
      const { rpc } = jest.requireMock('@/lib/stellar');
      freighter.signTransaction.mockResolvedValue('signed-tx-xdr');
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });

      let signed: string;
      await act(async () => {
        signed = await result.current.signOnly('tx-xdr');
      });

      expect(freighter.signTransaction).toHaveBeenCalledWith(
        'tx-xdr',
        expect.any(String),
      );
      expect(signed!).toBe('signed-tx-xdr');
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    });
  });

  describe('tab-refocus reconnect behavior', () => {
    it('preserves the stored network and warns on mismatch during visibilitychange', async () => {
      setupSep10();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useWalletContext(), { wrapper });

      // Connect on testnet (the default for the mock NETWORK).
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });

      const stored = localStorage.getItem('wallet_session');
      expect(stored).toContain('testnet');
      expect(result.current.isAuthenticated).toBe(true);

      // Simulate a session that was created on a different network (public)
      // to verify the reconnect path detects the drift and warns.
      const parsed = JSON.parse(stored!);
      localStorage.setItem(
        'wallet_session',
        JSON.stringify({ ...parsed, networkType: 'public' }),
      );

      // Simulate tab refocus: set visibilityState to 'visible' and fire
      // the visibilitychange event so the listener re-runs restoreSession.
      const visibilitySpy = jest
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Wallet network mismatch'),
        );
      });

      // Session should remain authenticated — the reconnect succeeds and
      // getPublicKey was called both during initial connect and on reconnect.
      expect(result.current.isAuthenticated).toBe(true);
      expect(freighter.getPublicKey).toHaveBeenCalledTimes(2);

      visibilitySpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('does not warn when the stored network matches the current env', async () => {
      setupSep10();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useWalletContext(), { wrapper });

      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });

      // Session network matches env (both testnet) — no warning expected.
      const visibilitySpy = jest
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      // Allow any async restore to settle.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);

      visibilitySpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('disconnect — contact-details cache purge', () => {
    it('purges cached contact details immediately on logout', async () => {
      setupSep10();
      const { result } = renderHook(() => useWalletContext(), { wrapper });
      await act(async () => {
        await result.current.connectWithProvider('freighter');
      });

      const key = contactDetailsKey('player-1', PUBLIC_KEY);
      await act(async () => {
        await cacheContactDetails(key, { email: 'p@example.com' });
      });

      const cacheProbe = renderHook(() =>
        useSWR(key, null, { revalidateOnFocus: false }),
      );
      expect(cacheProbe.result.current.data).toEqual({
        email: 'p@example.com',
      });

      await act(async () => {
        result.current.disconnect();
        // Let disconnect()'s fire-and-forget mutate()/purgeAllContactDetails()
        // promises settle.
        await Promise.resolve();
      });
      // SWR v2's cache subscription is useSyncExternalStore-based; a
      // globalMutate() from outside the probe hook's own render doesn't
      // reliably trigger it to re-render on its own in this jsdom/RTL
      // environment (a *fresh* render always sees the updated cache — only
      // an *already-rendered* hook instance doesn't auto-update) — force a
      // re-render to read the current cache state.
      cacheProbe.rerender();

      expect(cacheProbe.result.current.data).toBeUndefined();
    });
  });
});
