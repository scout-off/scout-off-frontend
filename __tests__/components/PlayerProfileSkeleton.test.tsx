import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerProfileSkeleton from '@/components/PlayerProfileSkeleton';

describe('PlayerProfileSkeleton', () => {
  it('renders without throwing', () => {
    expect(() => render(<PlayerProfileSkeleton />)).not.toThrow();
  });

  it('has aria-busy="true" for accessible loading indicator', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  it('has aria-label describing loading state', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('aria-label', 'Loading player profile');
  });

  it('renders avatar, name, and stat placeholders', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    const skeletonDivs = container.querySelectorAll('.bg-gray-700');
    // avatar(1) + name(1) + subtitle(1) + 4 stat labels + progress(1) + section header(1) = 9+
    expect(skeletonDivs.length).toBeGreaterThanOrEqual(9);
  });

  it('renders 3 milestone list item placeholders', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    const milestoneItems = container.querySelectorAll('li');
    expect(milestoneItems.length).toBe(3);
  });

  it('does not render contact button placeholder by default', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    const buttons = container.querySelectorAll('.h-12');
    expect(buttons.length).toBe(0);
  });

  it('renders contact button placeholder when showContactButton is true', () => {
    const { container } = render(<PlayerProfileSkeleton showContactButton />);
    const contactBtn = container.querySelector('.h-12');
    expect(contactBtn).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<PlayerProfileSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
