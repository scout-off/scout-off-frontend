"use client";
import Link from "next/link";
import WalletButton from "./WalletButton";
import { useContractHealth } from "@/hooks/useContractHealth";

export default function Navbar() {
  const { paused } = useContractHealth();

  return (
    <>
      {paused && (
        <div className="bg-yellow-500 text-black text-center text-sm font-medium py-2 px-4">
          ⚠️ ScoutOff is currently under maintenance. Write actions are temporarily disabled.
        </div>
      )}
      <nav className="border-b border-gray-800 bg-brand-dark">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-brand-green font-bold text-xl tracking-tight">
            ScoutOff
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-300">
            <Link href="/scout" className="hover:text-white transition">Scout Dashboard</Link>
            <Link href="/player" className="hover:text-white transition">Player Dashboard</Link>
            <WalletButton />
          </div>
        </div>
      </nav>
    </>
  );
}
