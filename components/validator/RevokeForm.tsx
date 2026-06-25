'use client';
import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { useValidator } from '@/hooks/useValidator';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Player, Milestone } from '@/types';

const ADMIN = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? '';

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface Props {
  player: Player;
  onSuccess: () => void;
}

export default function RevokeForm({ player, onSuccess }: Props) {
  const { publicKey } = useWallet();
  const { isValidator, checking, revokeMilestone, loading, error } =
    useValidator();

  const [selected, setSelected] = useState<Milestone | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (txError || error) {
      errorSummaryRef.current?.focus();
    }
  }, [txError, error]);

  const isAdmin = !!publicKey && publicKey === ADMIN;
  const paused = useIsPaused();

  function canRevoke(m: Milestone) {
    if (!publicKey) return false;
    return isAdmin || (isValidator && publicKey === m.validator);
  }

  const walletAuthorized = !!publicKey && (isAdmin || isValidator);

  async function handleConfirm() {
    if (!selected) return;
    setTxError(null);
    try {
      await revokeMilestone(player.id, selected.id);
      setConfirmOpen(false);
      setSelected(null);
      setSuccess(true);
      onSuccess();
    } catch (e: any) {
      setTxError(e.message ?? 'Transaction failed');
      setConfirmOpen(false);
    }
  }

  if (checking) {
    return <p className="text-sm text-gray-400">Checking authorization…</p>;
  }

  if (player.milestones.length === 0) {
    return <p className="text-sm text-gray-500">No milestones to revoke.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {paused && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
          <strong>Transactions are currently disabled.</strong>
        </div>
      )}
      {/* Warning banner */}
      <div
        className="flex items-start gap-2 rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300"
      >
        <span aria-hidden>⚠️</span>
        <span>
          Revoking a milestone may reduce the player&apos;s progress level.
        </span>
      </div>

      {/* Error summary */}
      {(error || txError) && (
        <div
          ref={errorSummaryRef}
          id="revoke-error-summary"
          role="alert"
          aria-label="Revocation error"
          tabIndex={-1}
          className="rounded-md border border-red-500 bg-red-950/30 p-3 outline-none"
        >
          <p className="text-sm text-red-400">{txError ?? error}</p>
        </div>
      )}

      {/* Milestone list */}
      <fieldset disabled={!walletAuthorized || loading || paused}>
        <legend className="sr-only">Select a milestone to revoke</legend>
        <ul className="flex flex-col gap-3">
          {player.milestones.map((m) => {
            const authorized = canRevoke(m);
            const isSelected = selected?.id === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={!authorized || loading}
                  onClick={() => setSelected(isSelected ? null : m)}
                  aria-pressed={isSelected}
                  className={[
                    'w-full text-left rounded-xl border px-4 py-3 transition',
                    isSelected
                      ? 'border-red-500 bg-red-950'
                      : authorized
                        ? 'border-gray-700 bg-brand-card hover:border-gray-500'
                        : 'border-gray-800 bg-gray-900 opacity-50 cursor-not-allowed',
                  ].join(' ')}
                >
                  <p className="font-medium text-white text-sm">
                    {m.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Approved by{' '}
                    <span className="font-mono" title={m.validator}>
                      {m.validator.slice(0, 6)}…{m.validator.slice(-4)}
                    </span>{' '}
                    · {formatDate(m.timestamp)}
                  </p>
                  {!authorized && (
                    <p className="text-xs text-gray-600 mt-1">
                      Not authorized to revoke this milestone
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

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
        aria-describedby={(error || txError) ? 'revoke-error-summary' : undefined}
        title={paused ? 'Contract is currently paused' : undefined}
        className="self-start rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Revoking…' : 'Revoke Selected Milestone'}
      </button>

      {/* Confirmation dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Revoke Milestone"
        message={
          selected
            ? `Are you sure you want to revoke "${selected.description}"? This may reduce the player's progress level and cannot be undone.`
            : ''
        }
        confirmLabel="Yes, Revoke"
        loading={loading}
      />
    </div>
  );
}
