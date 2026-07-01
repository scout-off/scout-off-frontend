import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '@/app/[locale]/page';

describe('HomePage', () => {
  it('renders the hero heading and calls to action for players and scouts', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Discover Football Talent/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: "I'm a Player" })).toHaveAttribute(
      'href',
      '/player',
    );
    expect(screen.getByRole('link', { name: "I'm a Scout" })).toHaveAttribute(
      'href',
      '/scout',
    );
  });

  it('renders a feature card for every entry in the features list', () => {
    render(<HomePage />);

    expect(screen.getByText('Tamper-Proof Profiles')).toBeInTheDocument();
    expect(screen.getByText('On-Chain Milestones')).toBeInTheDocument();
    expect(screen.getByText('Direct Scout Access')).toBeInTheDocument();
    expect(screen.getByText('Powered by Stellar')).toBeInTheDocument();
  });

  it('renders the footer with the current year and external links', () => {
    render(<HomePage />);

    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/jhayniffy/scout-off',
    );
  });
});
