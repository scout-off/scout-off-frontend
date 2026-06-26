import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerCardSkeleton from '@/components/PlayerCardSkeleton';

describe('PlayerCardSkeleton', () => {
  it('renders without throwing', () => {
    expect(() => render(<PlayerCardSkeleton />)).not.toThrow();
  });

  it('renders a card container', () => {
    const { container } = render(<PlayerCardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card.tagName).toBe('DIV');
  });

  it('renders skeleton elements for avatar, name lines, progress bar, and button', () => {
    const { container } = render(<PlayerCardSkeleton />);
    const skeletonDivs = container.querySelectorAll('.bg-gray-700');
    // avatar(1) + name/position/level(3) + progress(1) + button(1) = 6
    expect(skeletonDivs.length).toBeGreaterThanOrEqual(6);
  });

  it('has aria-hidden to hide decorative content from screen readers', () => {
    const { container } = render(<PlayerCardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('aria-hidden', 'true');
  });

  it('matches snapshot', () => {
    const { container } = render(<PlayerCardSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
