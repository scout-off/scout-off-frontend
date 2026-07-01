'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { mutate } from 'swr';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { rpc, NETWORK } from '@/lib/stellar';
import { walletAdapters } from '@/lib/walletAdapters';
import type { WalletProvider as WalletProviderAlias } from '@/lib/walletAdapters';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = WalletProviderAlias;

/** Stored wallet provider info used by WalletButton etc. */
export interface WalletProviderInfo {
  provider: WalletProvider;
  label: string;
  icon: string;
}

export const WALLET_PROVIDERS: WalletProviderInfo[] = [
  { provider: 'freighter', label: 'Freighter', icon: '🔶' },
  { provider: 'albedo', label: 'Albedo', icon: '✨' },
  { provider: 'lobstr', label: 'LOBSTR', icon: '🌐' },
];

/** Official install page for each wallet provider, used by the "Install" prompt. */
export const WALLET_INSTALL_URLS: Record<WalletProvider, string> = {
  freighter: 'https://freighter.app',
  albedo: 'https://albedo.link',
  lobstr: 'https://lobstr.co',
};

/** Checks whether a given wallet provider's extension/app is installed. */
export async function isWalletInstalled(provider: WalletProvider): Promise<boolean> {
  try {
    await walletAdapters[provider].getPublicKey();
    return true;
  } catch {
    return false;
  }
}

const WALLET_SESSION_KEY = 'wallet_session';

interface StoredSession {
  publicKey: string;
  provider: WalletProvider;
}

function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(WALLET_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function setStoredSession(publicKey: string, provider: WalletProvider) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ publicKey, provider }));
  }
}

function removeStoredSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(WALLET_SESSION_KEY);
  }
}

// ── Context value ─────────────────────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  connectingProvider: WalletProvider | null;
  isRestoringSession: boolean;
  xlmBalance: string | null;
  balanceError: string | null;
  isLoadingBalance: boolean;
  walletProvider: WalletProvider | null;
  walletProviderInfo: WalletProviderInfo | null;
  showWalletModal: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWithProvider: (provider: WalletProvider) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  signAndSubmit: (xdr: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<WalletProvider | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const walletProviderInfo: WalletProviderInfo | null = walletProvider
    ? (WALLET_PROVIDERS.find((wp) => wp.provider === walletProvider) ?? null)
    : null;

  const loadBalance = useCallback(async (address: string) => {
    setIsLoadingBalance(true);
    setBalanceError(null);
    try {
      const account = await rpc.getAccount(address);
      const native = (
        account.balances as Array<{ asset_type: string; balance: string }>
      ).find((b) => b.asset_type === 'native');
      setXlmBalance(native ? native.balance : '0.0000000');
    } catch (err: unknown) {
      setXlmBalance(null);
      setBalanceError(
        err instanceof Error ? err.message : 'Failed to load balance',
      );
    } finally {
      setIsLoadingBalance(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (publicKey) await loadBalance(publicKey);
  }, [publicKey, loadBalance]);

  // Restore session from localStorage on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = getStoredSession();
        if (session) {
          const { publicKey: pk, provider } = session;
          setPublicKey(pk);
          setIsAuthenticated(true);
          setWalletProvider(provider);
          await loadBalance(pk);
        }
      } catch {
        // Silently fail session restore
      } finally {
        setIsRestoringSession(false);
      }
    }
    restoreSession();
  }, [loadBalance]);

  const openWalletModal = useCallback(() => setShowWalletModal(true), []);
  const closeWalletModal = useCallback(() => setShowWalletModal(false), []);

  const doConnect = useCallback(
    async (provider: WalletProvider) => {
      setIsConnecting(true);
      setConnectingProvider(provider);
      try {
        const pk = await walletAdapters[provider].getPublicKey();

        // SEP-10 Auth Flow
        const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
        if (!challengeRes.ok) throw new Error('Failed to fetch auth challenge');
        const { transaction } = await challengeRes.json();

        const signedXdr = await walletAdapters[provider].signTransaction(
          transaction,
          NETWORK,
        );

        const authRes = await fetch('/api/auth/sep10', {
          method: 'POST',
          body: JSON.stringify({ signedXdr, publicKey: pk }),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!authRes.ok) throw new Error('Authentication failed');

        setPublicKey(pk);
        setIsAuthenticated(true);
        setWalletProvider(provider);
        setStoredSession(pk, provider);
        setShowWalletModal(false);
        await loadBalance(pk);
      } catch (error) {
        console.error('Connection/Auth error:', error);
        setPublicKey(null);
        setIsAuthenticated(false);
        setXlmBalance(null);
        throw error;
      } finally {
        setIsConnecting(false);
        setConnectingProvider(null);
      }
    },
    [loadBalance],
  );

  const connect = useCallback(async () => {
    const session = getStoredSession();
    if (session) {
      await doConnect(session.provider);
    } else {
      openWalletModal();
    }
  }, [doConnect, openWalletModal]);

  const connectWithProvider = useCallback(
    async (provider: WalletProvider) => {
      await doConnect(provider);
    },
    [doConnect],
  );

  const disconnect = useCallback(() => {
    Promise.resolve(fetch('/api/auth/sep10', { method: 'DELETE' })).catch(() => {});
    setPublicKey(null);
    setIsAuthenticated(false);
    setXlmBalance(null);
    setBalanceError(null);
    setWalletProvider(null);
    removeStoredSession();
    mutate(() => true, undefined, { revalidate: false });
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletProvider) throw new Error('No wallet provider selected');
      const signedXdr = await walletAdapters[walletProvider].signTransaction(
        xdr,
        NETWORK,
      );
      const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK);
      const result = await rpc.sendTransaction(tx as Parameters<typeof rpc.sendTransaction>[0]);
      return (result as { hash: string }).hash;
    },
    [publicKey, walletProvider],
  );

  const value = useMemo(
    () => ({
      publicKey,
      isAuthenticated,
      isConnecting,
      connectingProvider,
      isRestoringSession,
      xlmBalance,
      balanceError,
      isLoadingBalance,
      walletProvider,
      walletProviderInfo,
      showWalletModal,
      openWalletModal,
      closeWalletModal,
      connectWithProvider,
      connect,
      disconnect,
      signAndSubmit,
      refreshBalance,
    }),
    [
      publicKey,
      isAuthenticated,
      isConnecting,
      connectingProvider,
      isRestoringSession,
      xlmBalance,
      balanceError,
      isLoadingBalance,
      walletProvider,
      walletProviderInfo,
      showWalletModal,
      openWalletModal,
      closeWalletModal,
      connectWithProvider,
      connect,
      disconnect,
      signAndSubmit,
      refreshBalance,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error('useWalletContext must be used inside WalletProvider');
  return ctx;
}
