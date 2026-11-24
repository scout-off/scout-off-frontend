import type { Meta, StoryObj } from '@storybook/react';
import Spinner from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

/** Standalone spinner at the default (md) size — the most common usage. */
export const Default: Story = { args: { size: 'md' } };

/** Reduced size for inline or compact use-cases (e.g. inside table cells). */
export const Small: Story = { args: { size: 'sm' } };

/** Standard size — matches the default prop. */
export const Medium: Story = { args: { size: 'md' } };

/** Full-page or hero loading states where the spinner must be clearly visible. */
export const Large: Story = { args: { size: 'lg' } };

/**
 * Spinner embedded inside a disabled button, mirroring the Button component's
 * `isLoading` state.  Shows the real-world loading pattern used across form
 * submissions and write-action CTAs throughout the app.
 */
export const InsideButton: Story = {
  name: 'Inside Button (loading state)',
  render: () => (
    <button
      type="button"
      disabled
      className="inline-flex items-center justify-center gap-2 bg-brand-green text-black font-semibold px-6 py-3 rounded-xl opacity-50 cursor-not-allowed"
      aria-busy="true"
    >
      <Spinner size="sm" />
      Submitting…
    </button>
  ),
};

export const AllSizes: Story = {
  name: 'All Sizes',
  render: () => (
    <div className="flex items-center gap-8 text-white">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-gray-400">sm</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-xs text-gray-400">md</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-xs text-gray-400">lg</span>
      </div>
    </div>
  ),
};
