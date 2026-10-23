import type { Decorator, Meta, StoryObj } from '@storybook/react';
import FraudFlagsStalenessBadge from './FraudFlagsStalenessBadge';

const STATUS_URL = '/api/admin/fraud-flags/status';
const realFetch = window.fetch.bind(window);

// Answer the badge's status request locally so stories render without
// network access. `ageMs` is resolved against the moment of the request,
// which pins the rendered "… ago" label regardless of when the story runs.
function withStatus(
  ageMs: number | null,
  extra: { highSeverityCount?: number; eventsProcessed?: number } = {},
): Decorator {
  const decorator: Decorator = (Story) => {
    window.fetch = async (input, init) => {
      if (
        !String(input instanceof Request ? input.url : input).includes(
          STATUS_URL,
        )
      ) {
        return realFetch(input, init);
      }
      return new Response(
        JSON.stringify({
          evaluatedAt: ageMs === null ? null : Date.now() - ageMs,
          highSeverityCount: extra.highSeverityCount ?? 0,
          trigger: ageMs === null ? null : 'cron',
          eventsProcessed: extra.eventsProcessed,
          durationMs: 1200,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    return <Story />;
  };
  return decorator;
}

const meta: Meta<typeof FraudFlagsStalenessBadge> = {
  title: 'Components/Admin/FraudFlagsStalenessBadge',
  component: FraudFlagsStalenessBadge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FraudFlagsStalenessBadge>;

export const FreshEvaluation: Story = {
  decorators: [withStatus(15 * 60 * 1000, { eventsProcessed: 42 })],
};

export const FreshWithHighSeverity: Story = {
  decorators: [withStatus(15 * 60 * 1000, { highSeverityCount: 3 })],
};

export const StaleCronMissed: Story = {
  decorators: [withStatus(9 * 60 * 60 * 1000)],
};

// The badge renders nothing until a first evaluation has run.
export const NeverEvaluated: Story = {
  decorators: [withStatus(null)],
};
