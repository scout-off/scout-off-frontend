"use client";

import { useState, FormEvent } from "react";
import { useWallet } from "@/hooks/useWallet";
import { buildRevokeMilestone } from "@/lib/contract";
import { parseContractError } from "@/lib/contractErrorMessage";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface RevokeFormProps {
  onSuccess: () => void;
}

export default function RevokeForm({ onSuccess }: RevokeFormProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const [playerId, setPlayerId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    playerId?: string;
    milestoneId?: string;
  }>({});

  const validate = () => {
    const errors: { playerId?: string; milestoneId?: string } = {};
    if (!playerId.trim()) {
      errors.playerId = "Player ID is required";
    }
    if (!milestoneId.trim()) {
      errors.milestoneId = "Milestone ID is required";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) return;
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const xdr = await buildRevokeMilestone(publicKey, playerId, milestoneId);
      await signAndSubmit(xdr);
      onSuccess();
      setPlayerId("");
      setMilestoneId("");
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Player ID
          </label>
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className={`input ${validationErrors.playerId ? "border-red-500" : ""}`}
            placeholder="Enter player ID"
          />
          {validationErrors.playerId && (
            <p className="text-sm text-red-500 mt-1">{validationErrors.playerId}</p>
          )}
        </div>
      )}
      {/* Warning banner */}
      <div className="flex items-start gap-2 rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
        <span aria-hidden>⚠️</span>
        <span>
          Revoking a milestone may reduce the player&apos;s progress level.
        </span>
      </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Milestone ID
          </label>
          <input
            type="text"
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className={`input ${validationErrors.milestoneId ? "border-red-500" : ""}`}
            placeholder="Enter milestone ID"
          />
          {validationErrors.milestoneId && (
            <p className="text-sm text-red-500 mt-1">{validationErrors.milestoneId}</p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Disabled notice */}
      {!walletAuthorized && (
        <p className="text-sm text-gray-500" role="status">
          Your wallet is not authorized to revoke milestones.
        </p>
      )}

      {/* Success */}
      {success && (
        <p role="status" className="text-sm text-brand-green">
          Milestone revoked successfully.
        </p>
      )}

      {/* Revoke button */}
      <button
        type="button"
        disabled={!selected || !walletAuthorized || loading || paused}
        onClick={() => setConfirmOpen(true)}
        aria-describedby={error || txError ? 'revoke-error-summary' : undefined}
        title={paused ? 'Contract is currently paused' : undefined}
        className="self-start rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Revoking…' : 'Revoke Selected Milestone'}
      </button>

      <ConfirmDialog
        isOpen={showConfirm}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
        title="Revoke Milestone"
        message="Are you sure you want to revoke this milestone? This action cannot be undone."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
      />
    </>
  );
}
