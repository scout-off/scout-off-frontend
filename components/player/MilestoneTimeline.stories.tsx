import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent } from '@storybook/test';
import MilestoneTimeline from './MilestoneTimeline';
import type {
  Milestone,
  MilestoneDispute,
  MilestoneDisputeStatus,
} from '@/types';
import { mockCheckIsValidator } from '../../.storybook/mocks/lib-contract';
import { mockValidatorApi } from '../../.storybook/mocks/lib-api';

const VALIDATOR_A = 'GDVALIDATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const VALIDATOR_B = 'GDVALIDATORBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const PLAYER_WALLET =
  'GDPLAYERCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const MILESTONES: Milestone[] = [
  {
    id: 'm1',
    description: 'Verified academy trial',
    evidenceHash: 'bafybeigdyrztmilestone1',
    validator: VALIDATOR_A,
    timestamp: 1735689600, // 2025-01-01
  },
  {
    id: 'm2',
    description: 'Regional league appearance',
    evidenceHash: 'bafybeigdyrztmilestone2',
    validator: VALIDATOR_B,
    timestamp: 1743465600, // 2025-04-01
  },
  {
    id: 'm3',
    description: 'National youth squad call-up',
    evidenceHash: 'bafybeigdyrztmilestone3',
    validator: VALIDATOR_A,
    timestamp: 1751328000, // 2025-07-01
  },
];

function dispute(status: MilestoneDisputeStatus): MilestoneDispute {
  const decided = status === 'upheld' || status === 'reversed';
  return {
    id: 1,
    playerId: 'player-1',
    playerWallet: PLAYER_WALLET,
    validatorWallet: VALIDATOR_A,
    milestoneId: 'm1',
    milestoneDescription: MILESTONES[0].description,
    reason: 'Trial date recorded incorrectly',
    status,
    createdAt: Date.UTC(2025, 1, 1),
    responseDeadline: Date.UTC(2025, 1, 8),
    decidedAt: decided ? Date.UTC(2025, 1, 10) : null,
    decidedBy: decided ? VALIDATOR_B : null,
    resolutionNote: decided ? 'Reviewed by admin' : null,
    revokeTxHash: status === 'reversed' ? 'a1b2c3d4e5f6' : null,
  };
}

// Expanded detail panels render ValidatorChip; stub its contract/indexer
// lookups (see .storybook/mocks) so they resolve without network access.
const meta: Meta<typeof MilestoneTimeline> = {
  title: 'Components/Player/MilestoneTimeline',
  component: MilestoneTimeline,
  tags: ['autodocs'],
  beforeEach: () => {
    mockCheckIsValidator(async () => true);
    mockValidatorApi({ milestoneCount: 12, academy: null });
    return () => {
      mockCheckIsValidator(null);
      mockValidatorApi(null);
    };
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneTimeline>;

/** Expand the level-1 node so its detail panel (and dispute status) shows. */
async function expandFirstMilestone(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const [, level1] = canvas.getAllByRole('button', { name: /expand details/i });
  await userEvent.click(level1);
}

export const NewlyRegistered: Story = {
  args: { milestones: [], currentLevel: 0 },
};

export const SeveralApprovedLevels: Story = {
  args: { milestones: MILESTONES, currentLevel: 3 },
};

export const Collapsed: Story = {
  args: { milestones: MILESTONES, currentLevel: 2 },
};

export const Expanded: Story = {
  args: { milestones: MILESTONES, currentLevel: 2, disputes: [] },
  play: async ({ canvasElement }) => expandFirstMilestone(canvasElement),
};

function disputeStory(status: MilestoneDisputeStatus): Story {
  return {
    args: {
      milestones: MILESTONES,
      currentLevel: 3,
      disputes: [dispute(status)],
    },
    play: async ({ canvasElement }) => expandFirstMilestone(canvasElement),
  };
}

export const DisputePending = disputeStory('pending');
export const DisputeUnderReview = disputeStory('under_review');
export const DisputeEscalated = disputeStory('escalated');
export const DisputeUpheld = disputeStory('upheld');
export const DisputeReversed = disputeStory('reversed');
