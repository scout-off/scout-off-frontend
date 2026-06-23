'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import albedo from '@albedo-link/intent';
import { NETWORK } from '@/lib/stellar';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = 'freighter' | 'lobstr' | 'albedo';

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

interface WalletAdapter {
  isInstalled: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  signTransaction: (xdr: string) => Promise<string>;
}

const ADAPTERS: Record<WalletProvider, WalletAdapter> = {
  freighter: {
    isInstalled: async () => {
      const { isConnected } = await import('@stellar/freighter-api');
      const result = await isConnected();
      return typeof result === 'object' && result !== null
        ? (result as { isConnected: boolean }).isConnected
        : Boolean(result);
    },
    getPublicKey: async () => {
      const { getPublicKey } = await import('@stellar/freighter-api');
      const result = await getPublicKey();
      if (
        typeof result === 'object' &&
        result !== null &&
        'publicKey' in result
      ) {
        return (result as { publicKey: string }).publicKey;
      }
      return result as unknown as string;
    },
    signTransaction: async (xdr: string) => {
      const { signTransaction } = await import('@stellar/freighter-api');
      const result = await signTransaction(xdr, { networkPassphrase: NETWORK });
      if (
        typeof result === 'object' &&
        result !== null &&
        'signedTxXdr' in result
      ) {
        return (result as { signedTxXdr: string }).signedTxXdr;
      }
      return result as unknown as string;
    },
  },
  albedo: {
    isInstalled: async () => {
      return typeof window !== 'undefined' && 'albedo' in window;
    },
    getPublicKey: async () => {
      const result = await albedo.publicKey({});
      if (!result || !result.pubkey)
        throw new Error('Albedo returned no public key');
      return result.pubkey;
    },
    signTransaction: async (xdr: string) => {
      const network = NETWORK.includes('TESTNET') ? 'testnet' : 'public';
      const result = await albedo.tx({ xdr, network });
      if (!result || !result.signed_envelope_xdr)
        throw new Error('Albedo signing failed');
      return result.signed_envelope_xdr;
    },
  },
  lobstr: {
    isInstalled: async () => {
      try {
        const { isConnected: lobstrIsConnected } =
          await import('@lobstrco/signer-extension-api');
        return await lobstrIsConnected();
      } catch {
        return false;
      }
    },
    getPublicKey: async () => {
      const { getPublicKey: lobstrGetPublicKey } =
        await import('@lobstrco/signer-extension-api');
      const pk = await lobstrGetPublicKey();
      if (!pk) throw new Error('LOBSTR returned empty public key');
      return pk;
    },
    signTransaction: async (xdr: string) => {
      const { signTransaction: lobstrSignTransaction } =
        await import('@lobstrco/signer-extension-api');
      const signed = await lobstrSignTransaction(xdr);
      if (!signed) throw new Error('LOBSTR signing failed');
      return signed;
    },
  },
};

const PROVIDER_STORAGE_KEY = 'scoutoff_wallet_provider';

/** Returns the adapter for the currently persisted provider, or null. */
function getStoredProvider(): WalletProvider | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (
    stored &&
    (stored === 'freighter' || stored === 'albedo' || stored === 'lobstr')
  ) {
    return stored as WalletProvider;
  }
  return null;
}

function setStoredProvider(p: WalletProvider) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROVIDER_STORAGE_KEY, p);
  }
}

function removeStoredProvider() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PROVIDER_STORAGE_KEY);
  }
}

// ── Context value ─────────────────────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  xlmBalance: string | null;
  isLoadingBalance: boolean;
  walletProvider: WalletProvider | null;
  walletProviderInfo: WalletProviderInfo | null;
  showWalletModal: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWithProvider: (provider: WalletProvider) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSubmit: (xdr: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

/** Fetch the native XLM balance for a Stellar account via Horizon.
 *  Returns "0.00" for unfunded (404) accounts, null on other errors. */
async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (res.status === 404) {
      return '0.00';
    }
    if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
    const data = await res.json();
    const native = (
      data.balances as Array<{ asset_type: string; balance: string }>
    ).find((b) => b.asset_type === 'native');
    const raw = native ? parseFloat(native.balance) : 0;
    return raw.toFixed(2);
  } catch {
    return '0.00';
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(
    null,
  );
  const [showWalletModal, setShowWalletModal] = useState(false);

  const walletProviderInfo: WalletProviderInfo | null = walletProvider
    ? (WALLET_PROVIDERS.find((wp) => wp.provider === walletProvider) ?? null)
    : null;

  /** Fetch and store the XLM balance for the given address. */
  const loadBalance = useCallback(async (address: string) => {
    setIsLoadingBalance(true);
    try {
      const balance = await fetchXlmBalance(address);
      setXlmBalance(balance);
    } finally {
      setIsLoadingBalance(false);
    }
  }, []);

  /** Public refresh — callers (e.g. after a transaction) can trigger a re-fetch. */
  const refreshBalance = useCallback(async () => {
    if (publicKey) await loadBalance(publicKey);
  }, [publicKey, loadBalance]);

  // Restore session and provider on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const { publicKey: pk } = await res.json();
          setPublicKey(pk);
          setIsAuthenticated(true);
          await loadBalance(pk);
        }
      } catch {
        // Silently fail session restore
      }
    }
    restoreSession();

    // Restore persisted provider
    const stored = getStoredProvider();
    if (stored) setWalletProvider(stored);
  }, [loadBalance]);

  const openWalletModal = useCallback(() => setShowWalletModal(true), []);
  const closeWalletModal = useCallback(() => setShowWalletModal(false), []);

  /**
   * Core connection logic: authenticate with a specific wallet provider.
   * Shared by connect (uses stored provider) and connectWithProvider.
   */
  const doConnect = useCallback(
    async (provider: WalletProvider) => {
      const adapter = ADAPTERS[provider];
      setIsConnecting(true);
      try {
        if (!(await adapter.isInstalled())) {
          throw new Error(`${provider} is not installed`);
        }
        const pk = await adapter.getPublicKey();

        // SEP-10 Auth Flow
        const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
        if (!challengeRes.ok) throw new Error('Failed to fetch auth challenge');
        const { transaction } = await challengeRes.json();

        const signedXdr = await adapter.signTransaction(transaction);

        const authRes = await fetch('/api/auth/sep10', {
          method: 'POST',
          body: JSON.stringify({ transaction: signedXdr }),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!authRes.ok) throw new Error('Authentication failed');

        setPublicKey(pk);
        setIsAuthenticated(true);
        setWalletProvider(provider);
        setStoredProvider(provider);
        setShowWalletModal(false);
        // Fetch balance immediately after connecting
        await loadBalance(pk);
      } catch (error) {
        console.error('Connection/Auth error:', error);
        setPublicKey(null);
        setIsAuthenticated(false);
        setXlmBalance(null);
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    [loadBalance],
  );

  /** Connect using the previously stored provider, or open the modal if none. */
  const connect = useCallback(async () => {
    const stored = getStoredProvider();
    if (stored) {
      await doConnect(stored);
    } else {
      openWalletModal();
    }
  }, [doConnect, openWalletModal]);

  /** Connect using a specific provider (called from the wallet selection modal). */
  const connectWithProvider = useCallback(
    async (provider: WalletProvider) => {
      await doConnect(provider);
    },
    [doConnect],
  );

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/auth/sep10', { method: 'DELETE' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setPublicKey(null);
      setIsAuthenticated(false);
      setXlmBalance(null);
      setWalletProvider(null);
      removeStoredProvider();
    }
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletProvider) throw new Error('No wallet provider selected');
      const adapter = ADAPTERS[walletProvider];
      return adapter.signTransaction(xdr);
    },
    [publicKey, walletProvider],
  );

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        isAuthenticated,
        isConnecting,
        xlmBalance,
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
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error('useWalletContext must be used inside WalletProvider');
  return ctx;
}
