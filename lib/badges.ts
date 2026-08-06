import type { Player } from '@/types';

export type BadgeId =
  | 'first_milestone'
  | 'milestone_collector'
  | 'milestone_master'
  | 'profile_complete'
  | 'elite_tier';

export interface BadgeDefinition {
  id: BadgeId;
  label: string;
  description: string;
}

const MILESTONE_COLLECTOR_THRESHOLD = 5;
const MILESTONE_MASTER_THRESHOLD = 10;

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  first_milestone: {
    id: 'first_milestone',
    label: 'First Milestone',
    description: 'Earned your first verified on-chain milestone.',
  },
  milestone_collector: {
    id: 'milestone_collector',
    label: 'Milestone Collector',
    description: `Reached ${MILESTONE_COLLECTOR_THRESHOLD} verified milestones.`,
  },
  milestone_master: {
    id: 'milestone_master',
    label: 'Milestone Master',
    description: `Reached ${MILESTONE_MASTER_THRESHOLD} verified milestones.`,
  },
  profile_complete: {
    id: 'profile_complete',
    label: 'Profile Complete',
    description: 'Vitals, stats, and highlight media are all filled in.',
  },
  elite_tier: {
    id: 'elite_tier',
    label: 'Elite Tier',
    description: 'Reached Elite Tier, the highest progress level.',
  },
};

function isProfileComplete(player: Player): boolean {
  const { vitals } = player;
  return Boolean(
    vitals.name &&
    vitals.position &&
    vitals.region &&
    vitals.nationality &&
    vitals.age &&
    player.ipfsHash &&
    player.stats,
  );
}

/**
 * Computes which badges a player has earned from their current profile and
 * milestone data — purely derived, no persistence beyond `Player` itself.
 */
export function getEarnedBadgeIds(player: Player): BadgeId[] {
  const earned: BadgeId[] = [];
  const milestoneCount = player.milestones.length;

  if (milestoneCount >= 1) earned.push('first_milestone');
  if (milestoneCount >= MILESTONE_COLLECTOR_THRESHOLD)
    earned.push('milestone_collector');
  if (milestoneCount >= MILESTONE_MASTER_THRESHOLD)
    earned.push('milestone_master');
  if (isProfileComplete(player)) earned.push('profile_complete');
  if (player.progressLevel === 3) earned.push('elite_tier');

  return earned;
}

export function getEarnedBadges(player: Player): BadgeDefinition[] {
  return getEarnedBadgeIds(player).map((id) => BADGE_DEFINITIONS[id]);
}
