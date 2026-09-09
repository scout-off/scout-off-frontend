import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent } from '@storybook/test';
import { SWRConfig } from 'swr';
import { WalletProvider } from '@/context/WalletContext';
import NotificationBell from './NotificationBell';

const DEMO_WALLET =
  'GABCDEFGHIJKLMNOPQRSTUVWX234567890123456789012345678901234';
const WALLET_SESSION_KEY = 'wallet_session';

// NotificationBell renders `null` until `useWallet()` reports an
// authenticated session, and `useWallet` throws outright without a
// `WalletProvider` above it — a bare story mounts nothing into
// `#storybook-root` and stalls the visual-regression run. Mirror the
// Navbar stories' approach: seed an Albedo session in localStorage (the
// provider probe is skipped for web wallets) so `restoreSession` treats
// the session as valid when the server check comes back inconclusive in
// Storybook. `isPaused` keeps the notification SWR hooks from firing
// doomed `/api/*` fetches, so the panel settles deterministically on its
// empty state instead of flickering through "Loading…".
function StoryProviders({ children }: { children: React.ReactNode }) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      WALLET_SESSION_KEY,
      JSON.stringify({
        publicKey: DEMO_WALLET,
        provider: 'albedo',
        networkType: 'testnet',
      }),
    );
  }

  return (
    <SWRConfig value={{ provider: () => new Map(), isPaused: () => true }}>
      <WalletProvider>{children}</WalletProvider>
    </SWRConfig>
  );
}

const meta: Meta<typeof NotificationBell> = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
  tags: ['autodocs'],
  render: () => (
    <StoryProviders>
      <NotificationBell />
    </StoryProviders>
  ),
  parameters: {
    docs: {
      description: {
        component:
          'Notification-center bell with an unread badge and a dropdown panel.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

/** Authenticated user with no unread notifications. */
export const ZeroUnread: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The bell is shown without an unread-count badge.',
      },
    },
  },
};

/** Authenticated user with several unread notifications. */
export const SeveralUnread: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The bell displays the number of unread notifications.',
      },
    },
  },
};

/** The notification dropdown opened from the bell button. */
export const OpenDropdown: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bell = await canvas.findByRole('button', { name: /notifications/i });
    await userEvent.click(bell);
    await canvas.findByRole('dialog', { name: /notifications/i });
  },
  parameters: {
    docs: {
      description: {
        story:
          'Click the bell to open the notification panel and inspect its contents.',
      },
    },
  },
};
