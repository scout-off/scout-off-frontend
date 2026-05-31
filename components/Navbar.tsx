"use client";
import Link from "next/link";
import WalletButton from "./WalletButton";
import { useContractHealth } from "@/hooks/useContractHealth";
import { useTheme } from "@/hooks/useTheme";

export default function Navbar() {
  const { paused } = useContractHealth();
  const { theme, toggle } = useTheme();

  return (
    <>
      {paused && (
        <div className="bg-yellow-500 text-black text-center text-sm font-medium py-2 px-4">
          ⚠️ ScoutOff is currently under maintenance. Write actions are temporarily disabled.
        </div>
      )}
      <nav className="border-b border-gray-200 bg-white transition-colors duration-200 dark:border-gray-800 dark:bg-brand-dark">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-brand-green font-bold text-xl tracking-tight">
            ScoutOff
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-300">
            <Link href="/scout" className="hover:text-gray-900 dark:hover:text-white transition-colors duration-200">Scout Dashboard</Link>
            <Link href="/player" className="hover:text-gray-900 dark:hover:text-white transition-colors duration-200">Player Dashboard</Link>
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-brand-green hover:text-brand-green transition-colors duration-200 dark:border-gray-700 dark:text-gray-300"
            >
              {theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <WalletButton />
          </div>
        </div>
      </nav>
    </>
  );
}
