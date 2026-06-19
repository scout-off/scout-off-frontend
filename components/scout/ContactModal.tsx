"use client";
import { useState } from "react";
import Link from "next/link";
import type { Player, ContactDetails } from "@/types";
import { buildPayToContact } from "@/lib/contract";
import { useWallet } from "@/hooks/useWallet";
import { rpc } from "@/lib/stellar";

const FEE = process.env.NEXT_PUBLIC_PLATFORM_CONTACT_FEE_XLM ?? "1";

function parseError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("7") || msg.toLowerCase().includes("insufficientfee"))
    return "Insufficient XLM balance";
  if (msg.includes("8") || msg.toLowerCase().includes("subscriptionexpired"))
    return "subscription_expired";
  return msg;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-800 rounded-lg px-3 py-2">
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-brand-green hover:underline flex-shrink-0"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

interface Props {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactModal({ player, isOpen, onClose }: Props) {
  const { publicKey, signAndSubmit } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // Fetch balance when modal opens
  useState(() => {
    if (!isOpen || !publicKey) return;
    rpc.getAccount(publicKey)
      .then((acc) => {
        const xlm = (acc as any).balances?.find((b: any) => b.asset_type === "native");
        if (xlm) setBalance(parseFloat(xlm.balance).toFixed(2));
      })
      .catch(() => {});
  });

  async function handleConfirm() {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const xdr = await buildPayToContact(publicKey, player.id);
      const result = await signAndSubmit(xdr);
      // Extract contact details from result
      const data = (result as any)?.returnValue ?? (result as any);
      setContact(data as ContactDetails);
    } catch (e) {
      const msg = parseError(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-brand-card border border-gray-800 rounded-xl w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Contact {player.vitals.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {!contact ? (
          <>
            <div className="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Contact fee</span>
                <span className="text-brand-green font-semibold">{FEE} XLM</span>
              </div>
              {balance && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your balance</span>
                  <span className="text-white">{balance} XLM</span>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {error === "subscription_expired" ? (
                  <>
                    Your subscription has expired.{" "}
                    <Link href="/scout/subscribe" className="underline text-brand-green">
                      Please renew.
                    </Link>
                  </>
                ) : error}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={loading || !publicKey}
              className="w-full bg-brand-green text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Processing…" : `Pay ${FEE} XLM & Unlock`}
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">Contact details unlocked:</p>
            {contact.email && <CopyField label="Email" value={contact.email} />}
            {contact.phone && <CopyField label="Phone" value={contact.phone} />}
            {contact.telegram && <CopyField label="Telegram" value={contact.telegram} />}
            <button onClick={onClose} className="mt-2 text-sm text-gray-400 hover:text-white">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
