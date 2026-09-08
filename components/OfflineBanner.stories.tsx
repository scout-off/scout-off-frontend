import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import OfflineBanner from './OfflineBanner';

const messages = {
  offline: {
    bannerMessage: 'You are offline. Some features may be unavailable.',
  },
};

function ConnectionState({ Story }: { Story: Parameters<Decorator>[0] }) {
  useEffect(() => {
    return () => {
      delete (navigator as Navigator & { onLine?: boolean }).onLine;
    };
  }, []);

  return <Story />;
}

const withConnectionState: Decorator = (Story, context) => {
  const isOffline = context.parameters.isOffline ?? false;

  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: !isOffline,
    });
  }

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConnectionState Story={Story} />
    </NextIntlClientProvider>
  );
};

const meta: Meta<typeof OfflineBanner> = {
  title: 'Components/OfflineBanner',
  component: OfflineBanner,
  tags: ['autodocs'],
  decorators: [withConnectionState],
};

export default meta;
type Story = StoryObj<typeof OfflineBanner>;

export const Online: Story = {
  name: 'Online (hidden)',
  parameters: { isOffline: false },
};

export const Offline: Story = {
  name: 'Offline (visible)',
  parameters: { isOffline: true },
};
