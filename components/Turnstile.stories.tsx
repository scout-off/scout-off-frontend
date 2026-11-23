import type { Meta, StoryObj } from '@storybook/react';
import { useLayoutEffect } from 'react';
import Turnstile from './ui/Turnstile';

const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? 'storybook-site-key';

const meta: Meta<typeof Turnstile> = {
  title: 'Components/Turnstile',
  component: Turnstile,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Turnstile>;

function StoryFrame({
  children,
  loading = false,
}: {
  children: React.ReactNode;
  loading?: boolean;
}) {
  useLayoutEffect(() => {
    if (loading) {
      delete window.turnstile;
      return;
    }

    window.turnstile = {
      render: (container) => {
        container.innerHTML =
          '<div style="border: 1px solid #d1d5db; border-radius: 4px; padding: 16px; background: #fff; color: #111827; font: 14px sans-serif;">Turnstile widget</div>';
        return 'storybook-widget';
      },
      remove: (widgetId) => {
        if (widgetId === 'storybook-widget') return;
      },
    };

    return () => {
      delete window.turnstile;
    };
  }, [loading]);

  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      {children}
      {loading && (
        <div
          aria-label="Loading Turnstile widget"
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 4,
            color: '#6b7280',
            font: '14px sans-serif',
            marginTop: 8,
            padding: 16,
          }}
        >
          Loading verification…
        </div>
      )}
    </div>
  );
}

export const WidgetRendered: Story = {
  args: {
    siteKey: SITE_KEY,
    onVerify: () => undefined,
  },
  render: (args) => (
    <StoryFrame>
      <Turnstile {...args} />
    </StoryFrame>
  ),
};

export const Loading: Story = {
  args: {
    siteKey: SITE_KEY,
    onVerify: () => undefined,
  },
  render: (args) => (
    <StoryFrame loading>
      <Turnstile {...args} />
    </StoryFrame>
  ),
};
