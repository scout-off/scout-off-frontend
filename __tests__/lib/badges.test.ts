/**
 * Unit tests for lib/badges.ts badge-earning logic
 *
 * Covers boundary-value tests for milestone thresholds, elite tier progression,
 * profile completeness checks, and badge combinations. Each field in the
 * profile-complete check is tested individually to ensure load-bearing.
 */

import {
  getEarnedBadgeIds,
  getEarnedBadges,
  BADGE_DEFINITIONS,
  type BadgeId,
} from '@/lib/badges';
import type { Player, Milestone } from '@/types';

/**
 * Helper to construct a minimal valid Player fixture with sensible defaults.
 * Override any field to test specific conditions.
 */
function createPlayer(overrides: Partial<Player> = {}): Player {
  const baseMilestones: Milestone[] = [];
  const basePlayer: Player = {
    id: 'player-1',
    wallet: 'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
    ipfsHash: 'QmTestHash123456789',
    progressLevel: 0,
    milestones: baseMilestones,
    stats: {
      appearances: 10,
      goals: 5,
      assists: 2,
    },
    vitals: {
      name: 'Test Player',
      age: 20,
      position: 'ST',
      region: 'western',
      nationality: 'Ghana',
    },
    createdAt: 1704067200, // Unix timestamp for 2024-01-01
  };

  return { ...basePlayer, ...overrides };
}

describe('getEarnedBadgeIds and getEarnedBadges', () => {
  describe('milestone thresholds', () => {
    describe('first_milestone badge', () => {
      it('is not earned with 0 milestones', () => {
        const player = createPlayer({ milestones: [] });
        expect(getEarnedBadgeIds(player)).not.toContain('first_milestone');
      });

      it('is earned with exactly 1 milestone', () => {
        const player = createPlayer({
          milestones: [
            {
              id: 'm1',
              description: 'Scored first goal',
              evidenceHash: 'QmEvidence1',
              validator: 'GVALIDATOR1',
              timestamp: 1704067200,
            },
          ],
        });
        expect(getEarnedBadgeIds(player)).toContain('first_milestone');
      });

      it('is earned with more than 1 milestone', () => {
        const player = createPlayer({
          milestones: [
            {
              id: 'm1',
              description: 'Milestone 1',
              evidenceHash: 'QmEvidence1',
              validator: 'GVALIDATOR1',
              timestamp: 1704067200,
            },
            {
              id: 'm2',
              description: 'Milestone 2',
              evidenceHash: 'QmEvidence2',
              validator: 'GVALIDATOR1',
              timestamp: 1704153600,
            },
          ],
        });
        expect(getEarnedBadgeIds(player)).toContain('first_milestone');
      });
    });

    describe('milestone_collector badge (threshold: 5)', () => {
      it('is not earned with 4 milestones', () => {
        const milestones = Array.from({ length: 4 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).not.toContain('milestone_collector');
      });

      it('is earned with exactly 5 milestones', () => {
        const milestones = Array.from({ length: 5 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).toContain('milestone_collector');
      });

      it('is earned with more than 5 milestones', () => {
        const milestones = Array.from({ length: 8 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).toContain('milestone_collector');
      });
    });

    describe('milestone_master badge (threshold: 10)', () => {
      it('is not earned with 9 milestones', () => {
        const milestones = Array.from({ length: 9 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).not.toContain('milestone_master');
      });

      it('is earned with exactly 10 milestones', () => {
        const milestones = Array.from({ length: 10 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).toContain('milestone_master');
      });

      it('is earned with more than 10 milestones', () => {
        const milestones = Array.from({ length: 25 }, (_, i) => ({
          id: `m${i + 1}`,
          description: `Milestone ${i + 1}`,
          evidenceHash: `QmEvidence${i + 1}`,
          validator: 'GVALIDATOR1',
          timestamp: 1704067200 + i * 86400,
        }));
        const player = createPlayer({ milestones });
        expect(getEarnedBadgeIds(player)).toContain('milestone_master');
      });
    });
  });

  describe('elite_tier badge', () => {
    it('is not earned at progressLevel 0', () => {
      const player = createPlayer({ progressLevel: 0 });
      expect(getEarnedBadgeIds(player)).not.toContain('elite_tier');
    });

    it('is not earned at progressLevel 1', () => {
      const player = createPlayer({ progressLevel: 1 });
      expect(getEarnedBadgeIds(player)).not.toContain('elite_tier');
    });

    it('is not earned at progressLevel 2', () => {
      const player = createPlayer({ progressLevel: 2 });
      expect(getEarnedBadgeIds(player)).not.toContain('elite_tier');
    });

    it('is earned at exactly progressLevel 3', () => {
      const player = createPlayer({ progressLevel: 3 });
      expect(getEarnedBadgeIds(player)).toContain('elite_tier');
    });
  });

  describe('profile_complete badge', () => {
    describe('individual field requirements', () => {
      it('is not earned when vitals.name is missing', () => {
        const player = createPlayer({
          vitals: {
            name: '',
            age: 20,
            position: 'ST',
            region: 'western',
            nationality: 'Ghana',
          },
        });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when vitals.position is missing', () => {
        const player = createPlayer({
          vitals: {
            name: 'Test Player',
            age: 20,
            position: '',
            region: 'western',
            nationality: 'Ghana',
          },
        });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when vitals.region is missing', () => {
        const player = createPlayer({
          vitals: {
            name: 'Test Player',
            age: 20,
            position: 'ST',
            region: '',
            nationality: 'Ghana',
          },
        });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when vitals.nationality is missing', () => {
        const player = createPlayer({
          vitals: {
            name: 'Test Player',
            age: 20,
            position: 'ST',
            region: 'western',
            nationality: '',
          },
        });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when vitals.age is falsy (0 or missing)', () => {
        const player = createPlayer({
          vitals: {
            name: 'Test Player',
            age: 0,
            position: 'ST',
            region: 'western',
            nationality: 'Ghana',
          },
        });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when ipfsHash is missing', () => {
        const player = createPlayer({ ipfsHash: '' });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is not earned when stats is missing', () => {
        const player = createPlayer({ stats: null as any });
        expect(getEarnedBadgeIds(player)).not.toContain('profile_complete');
      });

      it('is earned when all fields are present and non-empty', () => {
        const player = createPlayer({
          vitals: {
            name: 'Test Player',
            age: 20,
            position: 'ST',
            region: 'western',
            nationality: 'Ghana',
          },
          ipfsHash: 'QmValidHash123456',
          stats: {
            appearances: 10,
            goals: 5,
            assists: 2,
          },
        });
        expect(getEarnedBadgeIds(player)).toContain('profile_complete');
      });
    });
  });

  describe('badge combinations', () => {
    it('returns all applicable badges for a player with 10+ milestones, complete profile, and elite tier', () => {
      const milestones = Array.from({ length: 15 }, (_, i) => ({
        id: `m${i + 1}`,
        description: `Milestone ${i + 1}`,
        evidenceHash: `QmEvidence${i + 1}`,
        validator: 'GVALIDATOR1',
        timestamp: 1704067200 + i * 86400,
      }));
      const player = createPlayer({
        milestones,
        progressLevel: 3,
        vitals: {
          name: 'Elite Player',
          age: 25,
          position: 'CM',
          region: 'southern',
          nationality: 'Nigeria',
        },
        ipfsHash: 'QmEliteHash',
        stats: { appearances: 50, goals: 20, assists: 15 },
      });

      const badges = getEarnedBadgeIds(player);
      expect(badges).toContain('first_milestone');
      expect(badges).toContain('milestone_collector');
      expect(badges).toContain('milestone_master');
      expect(badges).toContain('profile_complete');
      expect(badges).toContain('elite_tier');
      expect(badges.length).toBe(5);
    });

    it('returns only applicable badges when some conditions are met', () => {
      const milestones = Array.from({ length: 7 }, (_, i) => ({
        id: `m${i + 1}`,
        description: `Milestone ${i + 1}`,
        evidenceHash: `QmEvidence${i + 1}`,
        validator: 'GVALIDATOR1',
        timestamp: 1704067200 + i * 86400,
      }));
      const player = createPlayer({
        milestones,
        progressLevel: 2, // Not elite
        vitals: {
          name: 'Partial Player',
          age: 22,
          position: 'FW',
          region: 'central',
          nationality: 'Kenya',
        },
        ipfsHash: 'QmPartialHash',
        stats: { appearances: 25, goals: 10, assists: 5 },
      });

      const badges = getEarnedBadgeIds(player);
      expect(badges).toContain('first_milestone');
      expect(badges).toContain('milestone_collector');
      expect(badges).not.toContain('milestone_master');
      expect(badges).toContain('profile_complete');
      expect(badges).not.toContain('elite_tier');
      expect(badges.length).toBe(3);
    });
  });

  describe('zero badges', () => {
    it('returns empty array for fresh registration with no milestones, incomplete profile, level 0', () => {
      const player = createPlayer({
        milestones: [],
        progressLevel: 0,
        vitals: {
          name: 'New Player',
          age: 0, // Missing age
          position: 'ST',
          region: 'western',
          nationality: 'Ghana',
        },
        ipfsHash: '', // Missing ipfsHash
        stats: null as any, // Missing stats
      });

      expect(getEarnedBadgeIds(player)).toEqual([]);
    });

    it('returns empty array for fully unverified player', () => {
      const player = createPlayer({
        milestones: [],
        progressLevel: 0,
        vitals: {
          name: '',
          age: 0,
          position: '',
          region: '',
          nationality: '',
        },
        ipfsHash: '',
        stats: null as any,
      });

      expect(getEarnedBadgeIds(player)).toEqual([]);
    });
  });

  describe('getEarnedBadges', () => {
    it('maps earned badge ids to full BadgeDefinition objects', () => {
      const milestones = Array.from({ length: 1 }, (_, i) => ({
        id: `m${i + 1}`,
        description: `Milestone ${i + 1}`,
        evidenceHash: `QmEvidence${i + 1}`,
        validator: 'GVALIDATOR1',
        timestamp: 1704067200 + i * 86400,
      }));
      const player = createPlayer({
        milestones,
        vitals: {
          name: 'Test',
          age: 20,
          position: 'ST',
          region: 'western',
          nationality: 'Ghana',
        },
        ipfsHash: 'QmTest',
        stats: { appearances: 5, goals: 2, assists: 1 },
      });

      const badges = getEarnedBadges(player);
      expect(badges.length).toBeGreaterThan(0);
      badges.forEach((badge) => {
        expect(badge).toHaveProperty('id');
        expect(badge).toHaveProperty('label');
        expect(badge).toHaveProperty('description');
        expect(BADGE_DEFINITIONS[badge.id]).toBeDefined();
        expect(BADGE_DEFINITIONS[badge.id].id).toBe(badge.id);
      });
    });

    it('maintains correct order matching getEarnedBadgeIds', () => {
      const milestones = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i + 1}`,
        description: `Milestone ${i + 1}`,
        evidenceHash: `QmEvidence${i + 1}`,
        validator: 'GVALIDATOR1',
        timestamp: 1704067200 + i * 86400,
      }));
      const player = createPlayer({
        milestones,
        progressLevel: 3,
        vitals: {
          name: 'Test',
          age: 20,
          position: 'ST',
          region: 'western',
          nationality: 'Ghana',
        },
        ipfsHash: 'QmTest',
        stats: { appearances: 5, goals: 2, assists: 1 },
      });

      const badgeIds = getEarnedBadgeIds(player);
      const badges = getEarnedBadges(player);
      expect(badges.map((b) => b.id)).toEqual(badgeIds);
    });

    it('returns empty array when no badges are earned', () => {
      const player = createPlayer({
        milestones: [],
        progressLevel: 0,
        vitals: {
          name: '',
          age: 0,
          position: '',
          region: '',
          nationality: '',
        },
        ipfsHash: '',
        stats: null as any,
      });

      expect(getEarnedBadges(player)).toEqual([]);
    });
  });
});
