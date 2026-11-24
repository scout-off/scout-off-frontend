import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within, waitFor } from '@storybook/test';
import Tooltip from './Tooltip';
import Badge from './Badge';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  argTypes: {
    content: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: 'Hover or focus to see this tooltip',
    children: (
      <span className="text-brand-green underline cursor-help">Hover me</span>
    ),
  },
};

export const OnBadge: Story = {
  name: 'Wrapping a Badge',
  render: () => (
    <Tooltip content="This player has reached the professional tier">
      <Badge variant="level3" label="Professional" size="md" />
    </Tooltip>
  ),
};

export const LongContent: Story = {
  name: 'Long Tooltip Content',
  render: () => (
    <Tooltip content="Scouts can contact this player directly after purchasing a pay-to-contact token. The fee goes to the platform treasury and is non-refundable.">
      <span className="text-gray-400 underline cursor-help text-sm">
        What does pay-to-contact mean?
      </span>
    </Tooltip>
  ),
};

export const BottomFlip: Story = {
  name: 'Near Top of Viewport (flips below)',
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ paddingTop: '0px' }}>
      <Tooltip content="Tooltip flips below when near the top of the viewport">
        <span className="text-gray-400 underline cursor-help text-sm">
          Near top
        </span>
      </Tooltip>
    </div>
  ),
};

export const KeyboardDismiss: Story = {
  name: 'Keyboard Dismiss (Escape)',
  render: () => (
    <Tooltip content="Press Escape to dismiss this tooltip">
      <button
        type="button"
        className="rounded bg-brand-green px-3 py-1.5 text-sm font-medium text-black"
      >
        Hover then press Escape
      </button>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /Hover then press Escape/i });

    // Hover over the trigger to show the tooltip
    await userEvent.hover(button);

    // Wait for the tooltip to appear
    await waitFor(() => {
      within(document.body).getByRole('tooltip');
    });

    // Press Escape to dismiss
    await userEvent.keyboard('{Escape}');

    // Verify the tooltip is gone
    await waitFor(() => {
      const tooltip = document.body.querySelector('[role="tooltip"]');
      if (tooltip) throw new Error('Tooltip still visible after Escape');
    });
  },
};

export const HoverableTooltip: Story = {
  name: 'Hoverable Tooltip (pointer moves onto tooltip)',
  render: () => (
    <div style={{ padding: '60px' }}>
      <Tooltip content="Move your pointer onto this tooltip — it stays visible">
        <span className="text-brand-green underline cursor-help">
          Hover me, then move onto the tooltip
        </span>
      </Tooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByText(/Hover me, then move onto the tooltip/i);

    // Hover over the trigger to show the tooltip
    await userEvent.hover(trigger);

    // Wait for tooltip to appear
    await waitFor(() => {
      within(document.body).getByRole('tooltip');
    });

    // Move pointer onto the tooltip itself
    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLElement;
    if (tooltip) {
      await userEvent.hover(tooltip);
    }

    // Tooltip should still be visible after hovering onto it
    await waitFor(() => {
      within(document.body).getByRole('tooltip');
    });
  },
};
