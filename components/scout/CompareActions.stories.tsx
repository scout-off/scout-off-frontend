import type { Meta, StoryObj } from '@storybook/react';
import CompareActions from './CompareActions';
import { ToastProvider } from '@/components/ui/Toast';
import type { Player } from '@/types';

const player = (id: string, name: string): Player => ({
  id,
  wallet: 'GBKR6LYRKEFYV3MG322FYLED6PLOTEV77KCX6AZSR7V4RV7EJLIWOZJW',
  vitals: {
    name,
    age: 20,
    position: 'ST',
    region: 'West Africa',
    nationality: 'Ghanaian',
  },
  ipfsHash: '',
  progressLevel: 1,
  milestones: [],
  createdAt: 1_700_000_000,
  archived: false,
});

const meta: Meta<typeof CompareActions> = {
  title: 'Components/CompareActions',
  component: CompareActions,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CompareActions>;

export const Default: Story = {
  args: {
    players: [player('p1', 'Kwame Asante'), player('p2', 'Amara Diallo')],
  },
};

export const NoPlayers: Story = { args: { players: [] } };
