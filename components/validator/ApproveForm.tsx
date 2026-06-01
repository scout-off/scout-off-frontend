'use client';
import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import { getPlayer } from '@/lib/contract';
import { PROGRESS_LABELS } from '@/types';
import type { Player } from '@/types';

interface ApproveFormProps {
  onSuccess: () => void;
}

export default function ApproveForm({ onSuccess }: ApproveFormProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const { isValidator, checking, approveMilestone } = useValidator(publicKey);
  const [playerId, setPlayerId] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function handleUrlChange(value: string) {
    setEvidenceUrl(value);
    if (value && !validateUrl(value)) {
      setUrlError('Evidence URL must be a valid http/https URL');
    } else {
      setUrlError(null);
    }
  }

  async function handlePlayerSearch() {
    if (!playerId.trim()) return;
    setPlayerLoading(true);
    setPlayerError(null);
    try {
      const result = await getPlayer(playerId.trim());
      setPlayer(result as Player);
    } catch (e: any) {
      setPlayerError(e.message);
      setPlayer(null);
    } finally {
      setPlayerLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !isValidator) return;
    if (evidenceUrl && !validateUrl(evidenceUrl)) return;

    setSubmitting(true);
    setTxStatus("pending");
    setTxHash(null);
    setSubmitError(null);
    try {
      const xdr = await approveMilestone(playerId.trim(), description);
      const result = await signAndSubmit(xdr);
      const hash = (result as any)?.hash ?? null;
      setTxHash(hash);
      setTxStatus("success");
      onSuccess();
    } catch (e: any) {
      setTxStatus("error");
      setSubmitError(e?.message ?? "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!publicKey) {
    return (
      <p className="text-center text-gray-400 mt-20">
        Connect your wallet to approve milestones.
      </p>
    );
  }

  if (checking) {
    return (
      <p className="text-center text-gray-400 mt-20">
        Checking validator status&hellip;
      </p>
    );
  }

  if (!isValidator) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-400">Not a validator</p>
        <p className="text-gray-500 text-sm mt-1">
          Your wallet is not registered as a validator on this contract.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4"
    >
      <h2 className="text-xl font-semibold text-white">Approve Milestone</h2>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Player ID</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Enter player ID"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={handlePlayerSearch}
            disabled={playerLoading}
            className="bg-brand-green text-black font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 text-sm"
          >
            {playerLoading ? '\u2026' : 'Look up'}
          </button>
        </div>
        {playerError && <p className="text-red-400 text-xs">{playerError}</p>}
      </div>

      {player && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-300 flex flex-col gap-1">
          <p>
            <span className="text-gray-500">Name:</span> {player.vitals.name}
          </p>
          <p>
            <span className="text-gray-500">Level:</span>{' '}
            {PROGRESS_LABELS[player.progressLevel]}
          </p>
          <p>
            <span className="text-gray-500">Last milestone:</span>{' '}
            {player.milestones.length > 0
              ? player.milestones[player.milestones.length - 1].description
              : 'None'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Milestone Description</label>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder="Describe the player\u2019s achievement\u2026"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Evidence URL</label>
        <input
          className="input"
          placeholder="https://example.com/evidence"
          value={evidenceUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          required
        />
        {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
      </div>

      <TransactionStatus
        status={txStatus}
        txHash={txHash}
        error={submitError}
        onHide={() => setTxStatus(null)}
      />

      <button
        type="submit"
        disabled={submitting || !!urlError}
        className="bg-brand-green text-black font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
      >
        {submitting ? 'Submitting\u2026' : 'Approve Milestone'}
      </button>
    </form>
  );
}
