'use client';

/**
 * AcademyQuorumBadge (issue #1185)
 *
 * Shows the distinction between "on-chain approved (1 signer)" — true for
 * every milestone, always — and "academy-verified (quorum met)" for a
 * milestone whose approving validator belongs to an academy that has
 * configured a quorum, once enough of that academy's distinct member
 * wallets have each endorsed it. Renders nothing at all when the approving
 * validator has no academy, or that academy has no quorum configured — the
 * explicit "no regression for academies that don't opt in" requirement.
 *
 * The quorum requirement is purely additive display/workflow guidance: it
 * never blocks or delays the underlying on-chain `approve_milestone` call
 * (already complete by the time this milestone exists at all), and
 * endorsing here is a separate, off-chain-only action — see
 * lib/milestoneEndorsementStore.ts and docs/academy-validator-model.md.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import { useToast } from '@/components/ui/Toast';
import {
  fetchAcademyForWallet,
  fetchMilestoneEndorsements,
  endorseMilestone,
} from '@/lib/api';
import type { Academy, Milestone } from '@/types';

export interface AcademyQuorumBadgeProps {
  playerId: string;
  milestone: Milestone;
}

export default function AcademyQuorumBadge({
  playerId,
  milestone,
}: AcademyQuorumBadgeProps) {
  const { publicKey } = useWallet();
  const { isValidator } = useValidator(publicKey);
  const { show } = useToast();

  const [academy, setAcademy] = useState<Academy | null | undefined>(
    undefined,
  );
  const [endorserWallets, setEndorserWallets] = useState<string[]>([]);
  const [endorsing, setEndorsing] = useState(false);

  const load = useCallback(async () => {
    const [academyResult, endorsements] = await Promise.all([
      fetchAcademyForWallet(milestone.validator),
      fetchMilestoneEndorsements(playerId, milestone.id),
    ]);
    setAcademy(academyResult);
    setEndorserWallets(endorsements.map((e) => e.wallet));
  }, [milestone.validator, playerId, milestone.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Still loading, no academy at all, or an academy that hasn't opted into
  // a quorum — render nothing. This is the "no regression for academies
  // that don't opt in" requirement: identical to pre-#1185 behavior.
  if (!academy || !academy.quorum || academy.quorum <= 1) {
    return null;
  }

  const memberWallets = new Set(academy.members.map((m) => m.wallet));
  // Defensive: only count endorsements from wallets still on the academy's
  // roster today, in case a member was removed after endorsing.
  const distinctAcademyEndorsers = new Set(
    endorserWallets.filter((w) => memberWallets.has(w)),
  );
  const count = distinctAcademyEndorsers.size;
  const quorumMet = count >= academy.quorum;

  const canEndorse =
    Boolean(publicKey) &&
    isValidator &&
    memberWallets.has(publicKey as string) &&
    !distinctAcademyEndorsers.has(publicKey as string);

  const handleEndorse = async () => {
    setEndorsing(true);
    try {
      await endorseMilestone(playerId, milestone.id);
      await load();
      show({ message: 'Milestone endorsed', variant: 'success' });
    } catch (e: any) {
      show({
        message: e?.message ?? 'Failed to endorse milestone',
        variant: 'error',
      });
    } finally {
      setEndorsing(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="status"
        aria-label={
          quorumMet
            ? `Academy-verified: ${count} of ${academy.quorum} required ${academy.name} signers`
            : `Academy verification pending: ${count} of ${academy.quorum} required ${academy.name} signers`
        }
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none ${
          quorumMet
            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
            : 'bg-amber-900/60 text-amber-300 border border-amber-700/60'
        }`}
      >
        {quorumMet ? 'Academy-verified' : 'Academy pending'} ({count}/
        {academy.quorum})
      </span>

      {canEndorse && (
        <button
          type="button"
          onClick={handleEndorse}
          disabled={endorsing}
          className="text-xs text-brand-green underline hover:opacity-80 transition disabled:opacity-50"
        >
          {endorsing ? 'Endorsing…' : 'Endorse'}
        </button>
      )}
    </span>
  );
}
