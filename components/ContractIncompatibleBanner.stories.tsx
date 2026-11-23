import type { Meta, StoryObj } from '@storybook/react';
import ContractIncompatibleBanner from './ContractIncompatibleBanner';

const meta: Meta<typeof ContractIncompatibleBanner> = {
  title: 'Components/ContractIncompatibleBanner',
  component: ContractIncompatibleBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Blocking banner displayed when the deployed contract version is incompatible with this frontend build.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ContractIncompatibleBanner>;

/** The banner is rendered when the deployed contract version is incompatible. */
export const Visible: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'In the incompatible state, the banner displays the contract update message and blocks the top of the page.',
      },
    },
  },
};

/** The banner renders nothing when the contract is compatible. */
export const Hidden: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'In the compatible state, the banner is hidden so it does not take up space in the page layout.',
      },
    },
  },
};
