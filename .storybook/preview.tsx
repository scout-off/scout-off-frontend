import type { Preview, Decorator } from '@storybook/react';
import './tailwind.css';

const withDarkBackground: Decorator = (Story) => (
  <div style={{ backgroundColor: '#0A0F1E', minHeight: '100vh', padding: '1.5rem' }}>
    <Story />
  </div>
);

const preview: Preview = {
  decorators: [withDarkBackground],
  parameters: {
    backgrounds: {
      default: 'brand-dark',
      values: [
        { name: 'brand-dark', value: '#0A0F1E' },
        { name: 'brand-card', value: '#111827' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: { appDirectory: true },
  },
};

export default preview;
