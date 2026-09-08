import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from './ui/Toast';
import { WalletProvider } from '@/context/WalletContext';
import SessionExpiryWarning from './SessionExpiryWarning';

const messages = {
  session: {
    expiringSoonTitle: 'Session Expiring Soon',
    expiringSoonMessage: 'Your session expires in {minutes} minutes.',
    dismiss: 'Dismiss',
    reauthenticate: 'Renew Session',
    renewedSuccess: 'Session renewed successfully.',
    renewFailed: 'Failed to renew session.',
  },
};

const withSession: Decorator = (Story, context) => {
  const minutesUntilExpiry = context.parameters.minutesUntilExpiry ?? 10;
  const sessionExpiresAt = Date.now() + minutesUntilExpiry * 60 * 1000;

  if (typeof window !== 'undefined') {
    localStorage.setItem(
      'wallet_session',
      JSON.stringify({
        publicKey: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
        provider: 'albedo',
        networkType: 'testnet',
      }),
    );
    localStorage.setItem('scoutoff:session_expiry', String(sessionExpiresAt));
  }

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <WalletProvider key={minutesUntilExpiry}>
        <ToastProvider>
          <Story />
        </ToastProvider>
      </WalletProvider>
    </NextIntlClientProvider>
  );
};

const meta: Meta<typeof SessionExpiryWarning> = {
  title: 'Components/SessionExpiryWarning',
  component: SessionExpiryWarning,
  tags: ['autodocs'],
  decorators: [withSession],
};

export default meta;
type Story = StoryObj<typeof SessionExpiryWarning>;

export const FarFromExpiry: Story = {
  name: 'Far from expiry (hidden)',
  parameters: { minutesUntilExpiry: 10 },
};

export const NearExpiry: Story = {
  name: 'Near expiry (visible)',
  parameters: { minutesUntilExpiry: 1 },
};
