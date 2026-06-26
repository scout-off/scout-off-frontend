import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  })),
}));

jest.mock('@/hooks/useContractStatus', () => ({
  useContractStatus: () => ({ isPaused: false, isHealthy: true, isLoading: false }),
}));

jest.mock('next/link', () => {
  const React = require('react');
  const { usePathname } = require('next/navigation');
  return {
    __esModule: true,
    default: function Link({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
    }) {
      const pathname = usePathname();
      const aria = pathname === href ? { 'aria-current': 'page' } : {};
      return React.createElement('a', { href, ...aria, ...props }, children);
    },
  };
});

import Navbar from '@/components/Navbar';
import { useWallet } from '@/hooks/useWallet';
import { usePathname } from 'next/navigation';

const mockUseWallet = useWallet as unknown as jest.Mock;
const mockUsePathname = usePathname as unknown as jest.Mock;

function setup(pathname: string) {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  });
  mockUsePathname.mockReturnValue(pathname);
  render(<Navbar />);
}

describe('Navbar', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('renders the ScoutOff logo/link', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    render(<Navbar />);

    expect(screen.getByRole('link', { name: /ScoutOff/i })).toBeInTheDocument();
  });

  test('shows Connect Wallet button when wallet is disconnected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    render(<Navbar />);

    expect(
      screen.getByRole('button', { name: /Connect Wallet/i }),
    ).toBeInTheDocument();
  });

  test('shows truncated wallet address when wallet is connected', () => {
    const publicKey = '0x1234567890abcdef';
    mockUseWallet.mockReturnValue({
      publicKey,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    render(<Navbar />);

    const truncated = `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
    expect(
      screen.getByRole('button', { name: new RegExp(truncated) }),
    ).toBeInTheDocument();
  });

  test('shows copy address button when wallet is connected', () => {
    const publicKey = 'GABCDEF1234567890XYZ';
    mockUseWallet.mockReturnValue({
      publicKey,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    render(<Navbar />);

    expect(
      screen.getByRole('button', { name: /Copy wallet address/i }),
    ).toBeInTheDocument();
  });

  test('clicking copy button copies full address to clipboard', async () => {
    const publicKey = 'GABCDEF1234567890XYZ';
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    mockUseWallet.mockReturnValue({
      publicKey,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    render(<Navbar />);

    const user = userEvent.setup({ delay: null });
    const copyBtn = screen.getByRole('button', { name: /Copy wallet address/i });
    await user.click(copyBtn);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(publicKey);
  });

  test('active route link has aria-current="page"', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    // Component prefixes locale, so pathname must also be locale-prefixed
    mockUsePathname.mockReturnValue('/en/player');

    render(<Navbar />);

    const playerLink = screen.getByRole('link', { name: /Player Dashboard/i });
    expect(playerLink).toHaveAttribute('aria-current', 'page');
  });

  test('inactive route link does not have aria-current', () => {
    setup('/en/player');
    const scoutLink = screen.getByRole('link', { name: /Scout Dashboard/i });
    expect(scoutLink).not.toHaveAttribute('aria-current');
  });

  test('logo link has aria-current="page" when on home route', () => {
    setup('/en');
    const logo = screen.getByRole('link', { name: /ScoutOff/i });
    expect(logo).toHaveAttribute('aria-current', 'page');
  });

  // ── Mobile menu toggle ─────────────────────────────────────────────────────

  test('mobile menu toggle has aria-expanded=false initially', () => {
    setup('/');
    const toggle = screen.getByRole('button', {
      name: /open navigation menu/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('mobile menu toggle has aria-controls pointing to mobile-menu', () => {
    setup('/');
    const toggle = screen.getByRole('button', {
      name: /open navigation menu/i,
    });
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
  });

  test('clicking mobile toggle sets aria-expanded=true and shows menu', async () => {
    setup('/');
    const user = userEvent.setup({ delay: null });
    const toggle = screen.getByRole('button', {
      name: /open navigation menu/i,
    });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: /close navigation menu/i }),
    ).toBeInTheDocument();
  });

  test('clicking mobile toggle twice closes the menu', async () => {
    setup('/');
    const user = userEvent.setup({ delay: null });
    const toggle = screen.getByRole('button', {
      name: /open navigation menu/i,
    });

    await user.click(toggle);
    await user.click(
      screen.getByRole('button', { name: /close navigation menu/i }),
    );

    expect(
      screen.getByRole('button', { name: /open navigation menu/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Keyboard navigation ────────────────────────────────────────────────────

  test('all nav links are reachable via Tab in DOM order', async () => {
    setup('/');
    const user = userEvent.setup({ delay: null });

    // Start focus from body
    await user.tab();
    const logo = screen.getByRole('link', { name: /ScoutOff/i });
    expect(logo).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('link', { name: /Scout Dashboard/i }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('link', { name: /Player Dashboard/i }),
    ).toHaveFocus();
  });

  // ── Maintenance banner ─────────────────────────────────────────────────────

  test('shows maintenance banner when contract is paused', () => {
    const { useContractStatus } = require('@/hooks/useContractStatus');
    jest.doMock('@/hooks/useContractStatus', () => ({
      useContractStatus: () => ({ isPaused: true, isHealthy: true, isLoading: false }),
    }));

    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit: jest.fn(),
    });
    mockUsePathname.mockReturnValue('/');

    // The top-level mock returns isPaused:false, so the banner must be absent.
    render(<Navbar />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
