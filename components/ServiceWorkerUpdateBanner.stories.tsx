import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import ServiceWorkerUpdateBanner from './ServiceWorkerUpdateBanner';

const messageSkipWaiting = fn();

// useServiceWorkerUpdate listens to next-pwa's `window.workbox`. Install a
// stub that reports a waiting worker as soon as the hook subscribes, so the
// banner renders deterministically without a real service worker.
const withWaitingWorker: Decorator = (Story) => {
  window.workbox = {
    addEventListener: (type, listener) => {
      if (type === 'waiting') queueMicrotask(listener);
    },
    removeEventListener: () => {},
    messageSkipWaiting,
  };
  return <Story />;
};

const withoutWorker: Decorator = (Story) => {
  delete window.workbox;
  return <Story />;
};

const meta: Meta<typeof ServiceWorkerUpdateBanner> = {
  title: 'Components/ServiceWorkerUpdateBanner',
  component: ServiceWorkerUpdateBanner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ServiceWorkerUpdateBanner>;

export const UpdateAvailable: Story = {
  decorators: [withWaitingWorker],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    messageSkipWaiting.mockClear();
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Reload' }),
    );
    await expect(messageSkipWaiting).toHaveBeenCalledTimes(1);
  },
};

export const Hidden: Story = {
  decorators: [withoutWorker],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};
