import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import ScrollToTop from './ui/ScrollToTop';

const meta: Meta<typeof ScrollToTop> = {
  title: 'Components/ScrollToTop',
  component: ScrollToTop,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ScrollToTop>;

function ScrollPosition({ top }: { top: number }) {
  useEffect(() => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: top,
    });
    window.dispatchEvent(new Event('scroll'));

    return () => {
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 0,
      });
      window.dispatchEvent(new Event('scroll'));
    };
  }, [top]);

  return <ScrollToTop />;
}

export const HiddenNearTop: Story = {
  name: 'Hidden near the top of the page',
  render: () => <ScrollPosition top={0} />,
};

export const VisibleAfterScrolling: Story = {
  name: 'Visible after scrolling',
  render: () => <ScrollPosition top={400} />,
};
