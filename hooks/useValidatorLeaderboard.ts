'use client';

import useSWR from 'swr';
import { getValidators } from '@/lib/contract';
import { fetchValidatorMilestoneCount, fetchAcademyForWallet } from '@/lib/api';
import type { ValidatorInfo } from '@/types';
import {
  getValidatorLeaderboardRange,
  type ValidatorLeaderboardRange,
} from '@/lib/validatorLeaderboard';

export interface LeaderboardEntry {
  address: string;
  /** Academy name when this wallet is a registered signer for one, else the raw address. */
  displayName: string;
  isAcademy: boolean;
  /**
   * Total approved milestones for this validator — the same reputation
   * metric ValidatorChip surfaces per-milestone (issue #379). `null` when
   * the indexer is unavailable, so callers can render "unknown" instead of 0.
   */
  approvalCount: number | null;
  addedAt: number;
}

const LEADERBOARD_KEY = 'validator-leaderboard';

/**
 * Builds the leaderboard by combining the on-chain validator list with the
 * already-tracked per-validator approval count (issue #379's reputation
 * chip) and academy attribution — no new score is computed here.
 */
async function fetchLeaderboard(
  range: ValidatorLeaderboardRange,
): Promise<LeaderboardEntry[]> {
  const validators = (await getValidators()) as ValidatorInfo[];
  const bounds = getValidatorLeaderboardRange(range);

  const entries = await Promise.all(
    validators.map(async (v): Promise<LeaderboardEntry> => {
      const [approvalCount, academy] = await Promise.all([
        fetchValidatorMilestoneCount(
          v.address,
          range === 'all-time' ? undefined : bounds,
        ),
        fetchAcademyForWallet(v.address),
      ]);
      return {
        address: v.address,
        displayName: academy?.name ?? v.address,
        isAcademy: !!academy,
        approvalCount,
        addedAt: v.addedAt,
      };
    }),
  );

  // Rank by approval count descending; validators with an unknown count
  // (indexer down) sort to the bottom rather than displacing real leaders.
  return entries.sort((a, b) => {
    if (a.approvalCount === null && b.approvalCount === null) return 0;
    if (a.approvalCount === null) return 1;
    if (b.approvalCount === null) return -1;
    return b.approvalCount - a.approvalCount;
  });
}

/**
 * Public, wallet-free validator leaderboard data. Reads only from read-only
 * contract simulation and public indexer/academy endpoints, so it loads the
 * same for anonymous visitors and connected wallets.
 */
export function useValidatorLeaderboard(
  range: ValidatorLeaderboardRange = 'all-time',
  initialEntries?: LeaderboardEntry[],
) {
  const { data, error, isValidating } = useSWR<LeaderboardEntry[]>(
    [LEADERBOARD_KEY, range],
    () => fetchLeaderboard(range),
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
      fallbackData: initialEntries,
    },
  );

  return {
    entries: data ?? [],
    loading: isValidating && !data,
    error: error?.message ?? null,
  };
}
