'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  getPublicKey,
  isConnected,
  signTransaction,
} from '@stellar/freighter-api';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { rpc, NETWORK } from '@/lib/stellar';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = "freighter" | "lobstr";

interface WalletAdapter {
  isInstalled: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  signTransaction: (xdr: string) => Promise<string>;
}

const ADAPTERS: Record<WalletProvider, WalletAdapter> = {
  freighter: {
    isInstalled: async () => {
      const result = await freighterIsConnected();
      // freighter-api v2 returns { isConnected: boolean }
      return typeof result === "object" && result !== null
        ? (result as { isConnected: boolean }).isConnected
        : Boolean(result);
    },
    getPublicKey: async () => {
      const result = await freighterGetPublicKey();
      if (typeof result === "object" && result !== null && "publicKey" in result) {
        return (result as { publicKey: string }).publicKey;
      }
      return result as unknown as string;
    },
    signTransaction: async (xdr: string) => {
      const result = await freighterSignTransaction(xdr, {
        networkPassphrase: NETWORK,
      });
      if (typeof result === "object" && result !== null && "signedTxXdr" in result) {
        return (result as { signedTxXdr: string }).signedTxXdr;
      }
      return result as unknown as string;
    },
  },
  lobstr: {
    isInstalled: async () => {
      try {
        return await lobstrIsConnected();
      } catch {
        return false;
      }
    },
    getPublicKey: async () => {
      const pk = await lobstrGetPublicKey();
      if (!pk) throw new Error("LOBSTR returned empty public key");
      return pk;
    },
    signTransaction: async (xdr: string) => {
      const signed = await lobstrSignTransaction(xdr);
      if (!signed) throw new Error("LOBSTR signing failed");
      return signed;
    },
  },
};

const PROVIDER_STORAGE_KEY = "scoutoff_wallet_provider";

// ── Context value ─────────────────────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  xlmBalance: string | null;
  isLoadingBalance: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSubmit: (xdr: string) => Promise<unknown>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

/** Fetch the native XLM balance for a Stellar account via Horizon.
 *  Returns "0.00" for unfunded (404) accounts, null on other errors. */
async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (res.status === 404) {
      // New / unfunded account — treat as 0
      return "0.00";
    }
    if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
    const data = await res.json();
    const native = (data.balances as Array<{ asset_type: string; balance: string }>).find(
      (b) => b.asset_type === "native"
    );
    const raw = native ? parseFloat(native.balance) : 0;
    return raw.toFixed(2);
  } catch {
    return "0.00";
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

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

  // Restore session on mount
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
  }, [loadBalance]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      if (!(await isConnected())) throw new Error('Freighter not installed');
      const pk = await getPublicKey();

      // SEP-10 Auth Flow
      const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
      if (!challengeRes.ok) throw new Error('Failed to fetch auth challenge');
      const { transaction } = await challengeRes.json();

      const signedXdr = await signTransaction(transaction, {
        networkPassphrase: NETWORK,
      });

      const authRes = await fetch('/api/auth/sep10', {
        method: 'POST',
        body: JSON.stringify({ transaction: signedXdr }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!authRes.ok) throw new Error('Authentication failed');

      setPublicKey(pk);
      setIsAuthenticated(true);
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
  }, [loadBalance]);

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/auth/sep10', { method: 'DELETE' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setPublicKey(null);
      setIsAuthenticated(false);
      setXlmBalance(null);
    }
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string) => {
      if (!publicKey) throw new Error('Wallet not connected');
      const signed = await signTransaction(xdr, { networkPassphrase: NETWORK });
      const tx = TransactionBuilder.fromXDR(signed, NETWORK);
      return rpc.sendTransaction(tx);
    },
    [publicKey],
  );

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        isAuthenticated,
        isConnecting,
        connect,
        disconnect,
        signAndSubmit,
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
