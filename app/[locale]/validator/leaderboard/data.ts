import { getValidators } from '@/lib/contract';
import { fetchValidatorMilestoneCount, fetchAcademyForWallet } from '@/lib/api';
import type { ValidatorInfo } from '@/types';
import {
  getValidatorLeaderboardRange,
  type ValidatorLeaderboardRange,
} from '@/lib/validatorLeaderboard';

export interface LeaderboardEntry {
  address: string;
  displayName: string;
  isAcademy: boolean;
  approvalCount: number | null;
  addedAt: number;
}

export async function getLeaderboardData(
  range: ValidatorLeaderboardRange = 'all-time',
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

  return entries.sort((a, b) => {
    if (a.approvalCount === null && b.approvalCount === null) return 0;
    if (a.approvalCount === null) return 1;
    if (b.approvalCount === null) return -1;
    return b.approvalCount - a.approvalCount;
  });
}
