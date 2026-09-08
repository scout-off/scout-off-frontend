import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { useLayoutEffect, useState } from 'react';
import CookieConsentBanner from './ui/CookieConsentBanner';

const CONSENT_STORAGE_KEY = 'scoutoff:cookie-consent';

const meta: Meta<typeof CookieConsentBanner> = {
  title: 'Components/CookieConsentBanner',
  component: CookieConsentBanner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CookieConsentBanner>;

function ConsentStoryFrame() {
  const [choice, setChoice] = useState<'accepted' | 'declined' | null>(null);

  useLayoutEffect(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);

    return () => {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    };
  }, []);

  return (
    <>
      <CookieConsentBanner
        onConsentChange={(accepted) =>
          setChoice(accepted ? 'accepted' : 'declined')
        }
      />
      <p role="status">
        {choice === 'accepted' && 'Consent accepted'}
        {choice === 'declined' && 'Consent declined'}
      </p>
    </>
  );
}

export const InitialUnanswered: Story = {
  render: () => <ConsentStoryFrame />,
};

export const AfterAccepting: Story = {
  render: () => <ConsentStoryFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Accept' }),
    );
    await expect(canvas.findByText('Consent accepted')).resolves.toBeVisible();
  },
};

export const AfterRejecting: Story = {
  render: () => <ConsentStoryFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Decline' }),
    );
    await expect(canvas.findByText('Consent declined')).resolves.toBeVisible();
  },
};
