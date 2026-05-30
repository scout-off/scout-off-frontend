"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  getPublicKey as freighterGetPublicKey,
  isConnected as freighterIsConnected,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import {
  getPublicKey as lobstrGetPublicKey,
  isConnected as lobstrIsConnected,
  signTransaction as lobstrSignTransaction,
} from "@lobstrco/signer-extension-api";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { rpc, NETWORK } from "@/lib/stellar";

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
  /** Currently active wallet provider, or null when disconnected */
  activeProvider: WalletProvider | null;
  /** Whether the wallet selection modal is open */
  isSelectingWallet: boolean;
  /** Open the wallet selection modal */
  openWalletSelect: () => void;
  /** Close the wallet selection modal without connecting */
  closeWalletSelect: () => void;
  /** Connect with a specific provider */
  connect: (provider?: WalletProvider) => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSubmit: (xdr: string) => Promise<unknown>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<WalletProvider | null>(null);
  const [isSelectingWallet, setIsSelectingWallet] = useState(false);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          setPublicKey(data.publicKey);
          setIsAuthenticated(true);
          const stored = localStorage.getItem(PROVIDER_STORAGE_KEY) as WalletProvider | null;
          if (stored && (stored === "freighter" || stored === "lobstr")) {
            setActiveProvider(stored);
          }
        }
      } catch {
        // Silently fail session restore
      }
    }
    restoreSession();
  }, []);

  const openWalletSelect = useCallback(() => setIsSelectingWallet(true), []);
  const closeWalletSelect = useCallback(() => setIsSelectingWallet(false), []);

  const connect = useCallback(
    async (provider: WalletProvider = "freighter") => {
      setIsConnecting(true);
      setIsSelectingWallet(false);
      try {
        const adapter = ADAPTERS[provider];

        const installed = await adapter.isInstalled();
        if (!installed) {
          const installUrls: Record<WalletProvider, string> = {
            freighter: "https://www.freighter.app/",
            lobstr: "https://lobstr.co/signer-extension/",
          };
          throw new Error(
            `${provider === "lobstr" ? "LOBSTR" : "Freighter"} is not installed. Install it at ${installUrls[provider]}`
          );
        }

        const pk = await adapter.getPublicKey();

        // SEP-10 Auth Flow
        const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
        if (!challengeRes.ok) throw new Error("Failed to fetch auth challenge");
        const { transaction } = await challengeRes.json();

        const signedXdr = await adapter.signTransaction(transaction);

        const authRes = await fetch("/api/auth/sep10", {
          method: "POST",
          body: JSON.stringify({ transaction: signedXdr }),
          headers: { "Content-Type": "application/json" },
        });

        if (!authRes.ok) throw new Error("Authentication failed");

        setPublicKey(pk);
        setIsAuthenticated(true);
        setActiveProvider(provider);
        localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
      } catch (error) {
        console.error("Connection/Auth error:", error);
        setPublicKey(null);
        setIsAuthenticated(false);
        setActiveProvider(null);
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    []
  );

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/sep10", { method: "DELETE" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setPublicKey(null);
      setIsAuthenticated(false);
      setActiveProvider(null);
      localStorage.removeItem(PROVIDER_STORAGE_KEY);
    }
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string) => {
      if (!publicKey) throw new Error("Wallet not connected");
      if (!activeProvider) throw new Error("No wallet provider active");

      const signed = await ADAPTERS[activeProvider].signTransaction(xdr);
      const tx = TransactionBuilder.fromXDR(signed, NETWORK);
      return rpc.sendTransaction(tx);
    },
    [publicKey, activeProvider]
  );

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        isAuthenticated,
        isConnecting,
        activeProvider,
        isSelectingWallet,
        openWalletSelect,
        closeWalletSelect,
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
  if (!ctx) throw new Error("useWalletContext must be used inside WalletProvider");
  return ctx;
}
