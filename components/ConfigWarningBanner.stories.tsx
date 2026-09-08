import type { Meta, StoryObj } from '@storybook/react';
import type { ConfigWarning } from '@/lib/config';
import ConfigWarningBanner from './ConfigWarningBanner';

const meta: Meta<typeof ConfigWarningBanner> = {
  title: 'Components/ConfigWarningBanner',
  component: ConfigWarningBanner,
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('scoutoff:configWarningDismissed');
      }
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof ConfigWarningBanner>;

const contractIdWarning: ConfigWarning = {
  key: 'NEXT_PUBLIC_CONTRACT_ID',
  message:
    'The Soroban contract ID is not set. Configure it before using on-chain operations.',
  severity: 'error',
};

const networkWarning: ConfigWarning = {
  key: 'NEXT_PUBLIC_NETWORK',
  message: 'The network is not configured and will use the default setting.',
  severity: 'warning',
};

export const OneMissingVariable: Story = {
  args: {
    warnings: [contractIdWarning],
  },
};

export const SeveralMissingVariables: Story = {
  args: {
    warnings: [contractIdWarning, networkWarning],
  },
};

export const FullyConfigured: Story = {
  args: {
    warnings: [],
  },
};
