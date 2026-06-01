"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  getValidators,
  buildAddValidator,
  buildRemoveValidator,
  getPlatformFees,
  buildWithdrawFees,
  buildPauseContract,
  buildUnpauseContract,
  getContractPaused,
} from "@/lib/contract";
import type { ValidatorInfo } from "@/types";

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

type DialogAction = "add" | "remove" | "withdraw" | "pause" | "unpause" | null;

export default function AdminDashboard() {
  const { publicKey, signAndSubmit } = useWallet();
  const router = useRouter();
  const { show } = useToast();

  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [fees, setFees] = useState<number | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [validatorInput, setValidatorInput] = useState("");
  const [removeTarget, setRemoveTarget] = useState("");

  const [dialog, setDialog] = useState<{ action: DialogAction; label: string; message: string } | null>(null);

  // Gate: redirect non-admin
  useEffect(() => {
    if (!publicKey) return;
    if (publicKey !== ADMIN_ADDRESS) {
      show({ message: "Unauthorized: admin wallet required.", variant: "error" });
      router.replace("/");
    }
  }, [publicKey, router, show]);

  useEffect(() => {
    if (publicKey !== ADMIN_ADDRESS) return;
    Promise.all([getValidators(), getPlatformFees(), getContractPaused()])
      .then(([v, f, p]) => {
        setValidators(v);
        setFees(f as number);
        setPaused(p as boolean);
      })
      .catch(() => show({ message: "Failed to load admin data.", variant: "error" }))
      .finally(() => setLoading(false));
  }, [publicKey, show]);

  async function execAction(action: DialogAction) {
    if (!publicKey) return;
    setActionLoading(true);
    try {
      let xdr: string;
      if (action === "add") {
        xdr = await buildAddValidator(publicKey, validatorInput);
        await signAndSubmit(xdr);
        setValidators((v) => [...v, { address: validatorInput, addedAt: Date.now() / 1000, addedBy: publicKey }]);
        setValidatorInput("");
        show({ message: "Validator added.", variant: "success" });
      } else if (action === "remove") {
        xdr = await buildRemoveValidator(publicKey, removeTarget);
        await signAndSubmit(xdr);
        setValidators((v) => v.filter((val) => val.address !== removeTarget));
        setRemoveTarget("");
        show({ message: "Validator removed.", variant: "success" });
      } else if (action === "withdraw") {
        xdr = await buildWithdrawFees(publicKey);
        await signAndSubmit(xdr);
        setFees(0);
        show({ message: "Fees withdrawn.", variant: "success" });
      } else if (action === "pause") {
        xdr = await buildPauseContract(publicKey);
        await signAndSubmit(xdr);
        setPaused(true);
        show({ message: "Contract paused.", variant: "warning" });
      } else if (action === "unpause") {
        xdr = await buildUnpauseContract(publicKey);
        await signAndSubmit(xdr);
        setPaused(false);
        show({ message: "Contract unpaused.", variant: "success" });
      }
    } catch (e: any) {
      show({ message: e.message ?? "Transaction failed.", variant: "error" });
    } finally {
      setActionLoading(false);
      setDialog(null);
    }
  }

  if (!publicKey || publicKey !== ADMIN_ADDRESS) return null;
  if (loading) return <p className="text-center text-gray-400 mt-20">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>

      {/* Circuit Breaker */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Circuit Breaker</h2>
        <p className="text-sm text-gray-400">
          Status: <span className={paused ? "text-red-400 font-medium" : "text-brand-green font-medium"}>{paused ? "Paused" : "Active"}</span>
        </p>
        <button
          onClick={() =>
            setDialog(
              paused
                ? { action: "unpause", label: "Unpause Contract", message: "Are you sure you want to unpause the contract?" }
                : { action: "pause", label: "Pause Contract", message: "Are you sure you want to pause the contract? All operations will halt." }
            )
          }
          className={`w-fit px-5 py-2 rounded-lg font-semibold transition ${paused ? "bg-brand-green text-black hover:opacity-90" : "bg-red-600 text-white hover:bg-red-700"}`}
        >
          {paused ? "Unpause Contract" : "Pause Contract"}
        </button>
      </section>

      {/* Platform Fees */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Platform Fees</h2>
        <p className="text-sm text-gray-400">
          Accumulated: <span className="text-white font-medium">{fees ?? 0} XLM</span>
        </p>
        <button
          disabled={!fees || fees <= 0}
          onClick={() => setDialog({ action: "withdraw", label: "Withdraw Fees", message: `Withdraw ${fees} XLM to your wallet?` })}
          className="w-fit px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
        >
          Withdraw Fees
        </button>
      </section>

      {/* Add Validator */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Add Validator</h2>
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Stellar public key (G...)"
            value={validatorInput}
            onChange={(e) => setValidatorInput(e.target.value)}
          />
          <button
            disabled={!validatorInput.startsWith("G") || validatorInput.length !== 56}
            onClick={() => setDialog({ action: "add", label: "Add Validator", message: `Add ${validatorInput} as a validator?` })}
            className="px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </section>

      {/* Validators List + Remove */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Validators ({validators.length})</h2>
        {validators.length === 0 ? (
          <p className="text-sm text-gray-500">No validators authorized.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {validators.map((v) => (
              <li key={v.address} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-300 font-mono truncate">{v.address}</span>
                <button
                  onClick={() => {
                    setRemoveTarget(v.address);
                    setDialog({ action: "remove", label: "Remove Validator", message: `Remove ${v.address.slice(0, 8)}… from validators?` });
                  }}
                  className="text-red-400 hover:text-red-300 transition shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog && (
        <ConfirmDialog
          isOpen
          title={dialog.label}
          message={dialog.message}
          confirmLabel={dialog.label}
          loading={actionLoading}
          onConfirm={() => execAction(dialog.action)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
