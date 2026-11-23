import type { Meta, StoryObj } from '@storybook/react';
import ValidatorChip from './ValidatorChip';
import { mockCheckIsValidator } from '../../.storybook/mocks/lib-contract';
import { mockValidatorApi } from '../../.storybook/mocks/lib-api';

const VALIDATOR = 'GDVALIDATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ValidatorChip resolves its status from `checkIsValidator` (Soroban RPC)
// and the indexer; both are stubbed per story via the pass-through mocks
// aliased in .storybook/main.ts so the chip renders without network access.
const meta: Meta<typeof ValidatorChip> = {
  title: 'Components/Player/ValidatorChip',
  component: ValidatorChip,
  tags: ['autodocs'],
  args: { address: VALIDATOR },
  beforeEach: () => () => {
    mockCheckIsValidator(null);
    mockValidatorApi(null);
  },
};
export default meta;
type Story = StoryObj<typeof ValidatorChip>;

export const Loading: Story = {
  beforeEach: () => {
    mockCheckIsValidator(() => new Promise<boolean>(() => {}));
    mockValidatorApi({ milestoneCount: null, academy: null });
  },
};

export const ActiveValidator: Story = {
  beforeEach: () => {
    mockCheckIsValidator(async () => true);
    mockValidatorApi({ milestoneCount: 42, academy: null });
  },
};

export const FormerValidator: Story = {
  beforeEach: () => {
    mockCheckIsValidator(async () => false);
    mockValidatorApi({ milestoneCount: 7, academy: null });
  },
};

export const Unknown: Story = {
  beforeEach: () => {
    mockCheckIsValidator(async () => {
      throw new Error('RPC unavailable');
    });
    mockValidatorApi({ milestoneCount: null, academy: null });
  },
};
