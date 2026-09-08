'use client';

import { useState, useRef, FormEvent } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import useIsPaused from '@/hooks/useIsPaused';
import { buildRevokeMilestone } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import {
  TransactionFailedError,
  TransactionTimeoutError,
  pollTransaction,
} from '@/lib/stellar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Player } from '@/types';

interface RevokeFormProps {
  player?: Player;
  onSuccess: () => void;
}

type ConfirmationState =
  | 'idle'
  | 'confirming'
  | 'confirmed'
  | 'failed-on-chain'
  | 'timed-out';

interface RevokeState {
  txHash: string | null;
  confirmationState: ConfirmationState;
  error: string | null;
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
  const [revokeState, setRevokeState] = useState<RevokeState>({
    txHash: null,
    confirmationState: 'idle',
    error: null,
  });
  const errorRef = useRef<HTMLDivElement>(null);

  // Max 50 seconds = ~10 ledger closes at 5s each (Soroban standard)
  const CONFIRMATION_TIMEOUT_MS = 50000;
  const POLL_INTERVAL_MS = 3000;

  const handleRevokeClick = () => {
    if (!selected) return;
    setShowConfirm(true);
  };

  const handlePlayerConfirm = async () => {
    if (!selected || !player) return;
    try {
      setTxError(null);
      setRevokeState({
        txHash: null,
        confirmationState: 'confirming',
        error: null,
      });

      const result = await revokeMilestone(player.id, selected);

      if (result.hash) {
        setRevokeState({
          txHash: result.hash,
          confirmationState: 'confirmed',
          error: null,
        });
        // Wait a moment before resetting so UI shows success
        setTimeout(() => {
          onSuccess();
          setRevokeState({
            txHash: null,
            confirmationState: 'idle',
            error: null,
          });
          setSelected(null);
        }, 1500);
      }
    } catch (err) {
      if (err instanceof TransactionFailedError) {
        setRevokeState({
          txHash: (err as any).hash || revokeState.txHash,
          confirmationState: 'failed-on-chain',
          error:
            'Transaction failed on-chain. Please verify the milestone still exists and try again.',
        });
      } else if (err instanceof TransactionTimeoutError) {
        setRevokeState({
          txHash: (err as any).hash || revokeState.txHash,
          confirmationState: 'timed-out',
          error:
            'Confirmation timed out after 50 seconds. The transaction may still confirm later. Check the transaction hash on the blockchain explorer.',
        });
      } else {
        const msg = parseContractError(err);
        setTxError(msg);
      }
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setShowConfirm(false);
    }
  };

  const renderConfirmationStatus = () => {
    if (!revokeState.txHash) return null;

    const explorerUrl = `https://stellar.expert/explorer/${
      process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
    }/tx/${revokeState.txHash}`;

    switch (revokeState.confirmationState) {
      case 'confirming':
        return (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            <p className="font-semibold">Confirming on-chain...</p>
            <p className="text-xs text-yellow-200 mt-1">
              Transaction hash:{' '}
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                {revokeState.txHash.slice(0, 16)}...
              </a>
            </p>
            <p className="text-xs text-yellow-200 mt-1">
              This typically takes 5-15 seconds on Stellar.
            </p>
          </div>
        );
      case 'confirmed':
        return (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <p className="font-semibold">✓ Milestone revoked successfully</p>
            <p className="text-xs text-green-200 mt-1">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                View transaction
              </a>
            </p>
          </div>
        );
      case 'failed-on-chain':
        return (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <p className="font-semibold">✕ Revocation failed on-chain</p>
            <p className="text-sm mt-1">{revokeState.error}</p>
            <p className="text-xs text-red-200 mt-2">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                View transaction details
              </a>
            </p>
            <button
              type="button"
              onClick={() => {
                setRevokeState({
                  txHash: null,
                  confirmationState: 'idle',
                  error: null,
                });
              }}
              className="mt-2 text-xs underline hover:opacity-80"
            >
              Try again
            </button>
          </div>
        );
      case 'timed-out':
        return (
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
            <p className="font-semibold">⏱ Confirmation timed out</p>
            <p className="text-sm mt-1">{revokeState.error}</p>
            <p className="text-xs text-orange-200 mt-2">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                Check transaction status
              </a>
            </p>
            <button
              type="button"
              onClick={() => {
                setRevokeState({
                  txHash: null,
                  confirmationState: 'idle',
                  error: null,
                });
              }}
              className="mt-2 text-xs underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (player) {
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
        {renderConfirmationStatus()}
        <ul>
          {player.milestones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                aria-pressed={selected === m.id}
                disabled={revokeState.confirmationState === 'confirming'}
              >
                {m.description}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={
            !selected ||
            validatorLoading ||
            paused ||
            revokeState.confirmationState === 'confirming'
          }
          onClick={handleRevokeClick}
          aria-describedby={txError ? 'revoke-error-summary' : undefined}
        >
          {revokeState.confirmationState === 'confirming'
            ? 'Confirming…'
            : 'Revoke Selected Milestone'}
        </button>
        <ConfirmDialog
          isOpen={showConfirm}
          onConfirm={handlePlayerConfirm}
          onCancel={() => setShowConfirm(false)}
          title="Revoke Milestone"
          message="Are you sure you want to revoke this milestone? This action cannot be undone."
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          loading={revokeState.confirmationState === 'confirming'}
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
    setRevokeState({
      txHash: null,
      confirmationState: 'confirming',
      error: null,
    });
    try {
      const xdr = await buildRevokeMilestone(publicKey!, playerId, milestoneId);
      const result = await signAndSubmit(xdr);
      const hash =
        typeof result === 'string' ? result : ((result as any)?.hash ?? null);

      if (hash) {
        setRevokeState({
          txHash: hash,
          confirmationState: 'confirmed',
          error: null,
        });
        setTimeout(() => {
          onSuccess();
          setPlayerId('');
          setMilestoneId('');
          setRevokeState({
            txHash: null,
            confirmationState: 'idle',
            error: null,
          });
        }, 1500);
      }
    } catch (err) {
      if (err instanceof TransactionFailedError) {
        setRevokeState({
          txHash: (err as any).hash || revokeState.txHash,
          confirmationState: 'failed-on-chain',
          error:
            'Transaction failed on-chain. Please verify the milestone still exists and try again.',
        });
      } else if (err instanceof TransactionTimeoutError) {
        setRevokeState({
          txHash: (err as any).hash || revokeState.txHash,
          confirmationState: 'timed-out',
          error:
            'Confirmation timed out after 50 seconds. The transaction may still confirm later. Check the transaction hash on the blockchain explorer.',
        });
      } else {
        setError(parseContractError(err));
      }
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {renderConfirmationStatus()}
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
            disabled={revokeState.confirmationState === 'confirming'}
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
            disabled={revokeState.confirmationState === 'confirming'}
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
          disabled={isLoading || revokeState.confirmationState === 'confirming'}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {revokeState.confirmationState === 'confirming'
            ? 'Confirming…'
            : 'Revoke Milestone'}
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
        loading={revokeState.confirmationState === 'confirming'}
      />
    </>
  );
}
