'use client';

import { useState, useRef, FormEvent } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRevokeMilestone } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Player } from '@/types';

interface RevokeFormProps {
  player?: Player;
  onSuccess: () => void;
}

export default function RevokeForm({ player, onSuccess }: RevokeFormProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const { revokeMilestone, loading: validatorLoading } = useValidator();
  const paused = useIsPaused();

  // Player-mode state
  const [selected, setSelected] = useState<string | null>(null);

  // Text-input mode state
  const [playerId, setPlayerId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    playerId?: string;
    milestoneId?: string;
  }>({});

  // Shared state
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  if (player) {
    const handleRevokeClick = () => {
      if (!selected) return;
      setShowConfirm(true);
    };

    const handlePlayerConfirm = async () => {
      if (!selected) return;
      try {
        setTxError(null);
        await revokeMilestone(player.id, selected);
        onSuccess();
      } catch (err) {
        const msg = parseContractError(err);
        setTxError(msg);
        setTimeout(() => errorRef.current?.focus(), 0);
      }
      setShowConfirm(false);
    };

    return (
      <>
        {txError && (
          <div
            id="revoke-error-summary"
            role="alert"
            aria-label="Revocation error"
            ref={errorRef}
            tabIndex={-1}
          >
            {txError}
          </div>
        )}
        <ul>
          {player.milestones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                aria-pressed={selected === m.id}
              >
                {m.description}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!selected || validatorLoading || paused}
          onClick={handleRevokeClick}
          aria-describedby={txError ? 'revoke-error-summary' : undefined}
        >
          {validatorLoading ? 'Revoking…' : 'Revoke Selected Milestone'}
        </button>
        <ConfirmDialog
          isOpen={showConfirm}
          onConfirm={handlePlayerConfirm}
          onCancel={() => setShowConfirm(false)}
          title="Revoke Milestone"
          message="Are you sure you want to revoke this milestone? This action cannot be undone."
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          loading={validatorLoading}
        />
      </>
    );
  }

  // Text-input mode: form with player ID and milestone ID inputs

  const validate = () => {
    const errors: { playerId?: string; milestoneId?: string } = {};
    if (!playerId.trim()) errors.playerId = 'Player ID is required';
    if (!milestoneId.trim()) errors.milestoneId = 'Milestone ID is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    if (!publicKey) {
      setError('Wallet not connected');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const xdr = await buildRevokeMilestone(publicKey!, playerId, milestoneId);
      await signAndSubmit(xdr);
      onSuccess();
      setPlayerId('');
      setMilestoneId('');
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
          <label
            htmlFor="revoke-player-id"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Player ID
          </label>
          <input
            id="revoke-player-id"
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className={`input ${validationErrors.playerId ? 'border-red-500' : ''}`}
            placeholder="Enter player ID"
          />
          {validationErrors.playerId && (
            <p className="text-sm text-red-500 mt-1">
              {validationErrors.playerId}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="revoke-milestone-id"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Milestone ID
          </label>
          <input
            id="revoke-milestone-id"
            type="text"
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className={`input ${validationErrors.milestoneId ? 'border-red-500' : ''}`}
            placeholder="Enter milestone ID"
          />
          {validationErrors.milestoneId && (
            <p className="text-sm text-red-500 mt-1">
              {validationErrors.milestoneId}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Revoking…' : 'Revoke Milestone'}
        </button>
      </form>
      <ConfirmDialog
        isOpen={showConfirm}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
        title="Revoke Milestone"
        message="Are you sure you want to revoke this milestone? This action cannot be undone."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        loading={isLoading}
      />
    </>
  );
}
