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

interface WalletContextValue {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSubmit: (xdr: string) => Promise<unknown>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const { publicKey } = await res.json();
          setPublicKey(publicKey);
          setIsAuthenticated(true);
        }
      } catch (error) {
        // Silently fail session restore
      }
    }
    restoreSession();
  }, []);

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
    } catch (error) {
      console.error('Connection/Auth error:', error);
      setPublicKey(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/auth/sep10', { method: 'DELETE' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setPublicKey(null);
      setIsAuthenticated(false);
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
