"use client";
import { useWallet } from "@/hooks/useWallet";

export default function WalletButton() {
  const { publicKey, connect, disconnect, isConnecting } = useWallet();

  if (publicKey) {
    return (
      <button
        onClick={disconnect}
        aria-label={`Disconnect wallet — ${publicKey}`}
        aria-pressed={true}
        className="text-sm bg-brand-card border border-brand-green text-brand-green px-4 py-2 rounded-lg hover:bg-brand-green hover:text-black transition"
      >
        {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      aria-label="Connect wallet"
      aria-pressed={false}
      className="text-sm bg-brand-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
    >
      {isConnecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
