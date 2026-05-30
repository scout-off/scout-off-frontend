"use client";
import { useEffect, useRef } from "react";
import { useWallet } from "@/hooks/useWallet";
import type { WalletProvider } from "@/context/WalletContext";

const WALLET_OPTIONS: {
  id: WalletProvider;
  label: string;
  description: string;
  installUrl: string;
}[] = [
  {
    id: "freighter",
    label: "Freighter",
    description: "Stellar browser extension wallet",
    installUrl: "https://www.freighter.app/",
  },
  {
    id: "lobstr",
    label: "LOBSTR",
    description: "Sign with your LOBSTR mobile wallet",
    installUrl: "https://lobstr.co/signer-extension/",
  },
];

export default function WalletButton() {
  const {
    publicKey,
    connect,
    disconnect,
    isConnecting,
    activeProvider,
    isSelectingWallet,
    openWalletSelect,
    closeWalletSelect,
  } = useWallet();

  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!isSelectingWallet) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWalletSelect();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isSelectingWallet, closeWalletSelect]);

  // Trap focus inside modal
  useEffect(() => {
    if (isSelectingWallet && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isSelectingWallet]);

  if (publicKey) {
    return (
      <button
        onClick={disconnect}
        aria-label={`Disconnect wallet ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}${activeProvider ? ` (${activeProvider})` : ""}`}
        className="text-sm bg-brand-card border border-brand-green text-brand-green px-4 py-2 rounded-lg hover:bg-brand-green hover:text-black transition"
      >
        {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={openWalletSelect}
        disabled={isConnecting}
        className="text-sm bg-brand-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>

      {/* Wallet selection modal */}
      {isSelectingWallet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select a wallet"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWalletSelect();
          }}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 outline-none"
          >
            <h2 className="text-white font-semibold text-lg mb-4">Connect Wallet</h2>

            <ul className="flex flex-col gap-3" role="list">
              {WALLET_OPTIONS.map((wallet) => (
                <li key={wallet.id}>
                  <button
                    onClick={() => connect(wallet.id)}
                    className="w-full flex items-center gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-brand-green rounded-xl px-4 py-3 transition text-left focus:outline-none focus:ring-2 focus:ring-brand-green"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{wallet.label}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{wallet.description}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-gray-500 text-xs mt-4 text-center">
              Don&apos;t have a wallet?{" "}
              {WALLET_OPTIONS.map((w, i) => (
                <span key={w.id}>
                  <a
                    href={w.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-green underline"
                  >
                    Install {w.label}
                  </a>
                  {i < WALLET_OPTIONS.length - 1 ? " or " : ""}
                </span>
              ))}
            </p>

            <button
              onClick={closeWalletSelect}
              aria-label="Close wallet selection"
              className="mt-4 w-full text-sm text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
