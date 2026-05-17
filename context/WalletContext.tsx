"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getPublicKey, isConnected, signTransaction } from "@stellar/freighter-api";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { rpc, NETWORK } from "@/lib/stellar";

interface WalletContextValue {
  publicKey: string | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signAndSubmit: (xdr: string) => Promise<unknown>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Restore session on mount
  useEffect(() => {
    isConnected().then((connected) => {
      if (connected) getPublicKey().then(setPublicKey).catch(() => {});
    });
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      if (!(await isConnected())) throw new Error("Freighter not installed");
      setPublicKey(await getPublicKey());
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setPublicKey(null), []);

  const signAndSubmit = useCallback(async (xdr: string) => {
    if (!publicKey) throw new Error("Wallet not connected");
    const signed = await signTransaction(xdr, { networkPassphrase: NETWORK });
    const tx = TransactionBuilder.fromXDR(signed, NETWORK);
    return rpc.sendTransaction(tx);
  }, [publicKey]);

  return (
    <WalletContext.Provider value={{ publicKey, isConnecting, connect, disconnect, signAndSubmit }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used inside WalletProvider");
  return ctx;
}
