"use client";

import { useEffect, useRef } from "react";
import Spinner from "@/components/ui/Spinner";

export type TxStatus = "pending" | "success" | "error";

export interface TransactionStatusProps {
  status: TxStatus | null;
  txHash?: string | null;
  error?: string | null;
  /** Milliseconds before success state auto-hides. Defaults to 8000. */
  autoHideMs?: number;
  onHide?: () => void;
}

function explorerUrl(hash: string): string {
  const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

export default function TransactionStatus({
  status,
  txHash,
  error,
  autoHideMs = 8000,
  onHide,
}: TransactionStatusProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "success") {
      timerRef.current = setTimeout(() => {
        onHide?.();
      }, autoHideMs);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, autoHideMs, onHide]);

  if (!status) return null;

  if (status === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-gray-700 bg-brand-card px-4 py-3 text-sm text-gray-300"
      >
        <Spinner size="sm" />
        <span>Submitting transaction…</span>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-brand-green bg-brand-card px-4 py-3 text-sm"
      >
        <span className="text-brand-green" aria-hidden="true">✓</span>
        <span className="text-gray-200">Transaction confirmed.</span>
        {txHash && (
          <a
            href={explorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-brand-green underline hover:opacity-80 transition"
            aria-label="View transaction on Stellar Expert"
          >
            View on Explorer
          </a>
        )}
      </div>
    );
  }

  // error
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-xl border border-red-500 bg-brand-card px-4 py-3 text-sm"
    >
      <span className="text-red-500 mt-0.5" aria-hidden="true">✕</span>
      <span className="text-red-300">{error ?? "Transaction failed."}</span>
    </div>
  );
}
