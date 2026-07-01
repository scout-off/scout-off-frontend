import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import useIsPaused from '@/hooks/useIsPaused';
import ContractPausedBanner from '@/components/ContractPausedBanner';

const mockUseIsPaused = useIsPaused as jest.Mock;

const SESSION_KEY = 'scoutoff:contractPausedDismissed';

const SUPPORT_URL = 'https://discord.gg/stellar';

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('ContractPausedBanner', () => {
  it('is not rendered when paused is false', () => {
    mockUseIsPaused.mockReturnValue(false);
    const { container } = render(<ContractPausedBanner />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('renders warning message and dismiss button when paused is true', () => {
    mockUseIsPaused.mockReturnValue(true);
    render(<ContractPausedBanner />);
    expect(
      screen.getByText('ScoutOff is currently under maintenance.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Transactions are disabled.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /get updates on discord/i }),
    ).toHaveAttribute('href', SUPPORT_URL);
    expect(
      screen.getByRole('button', { name: /dismiss/i }),
    ).toBeInTheDocument();
  });

  it('hides the banner when the dismiss button is clicked', () => {
    mockUseIsPaused.mockReturnValue(true);
    const { container } = render(<ContractPausedBanner />);
    expect(
      screen.getByRole('button', { name: /dismiss/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('persists dismissed state in sessionStorage', () => {
    mockUseIsPaused.mockReturnValue(true);
    render(<ContractPausedBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(sessionStorage.getItem(SESSION_KEY)).toBe('1');
  });

  it('remains hidden on re-render when dismissed state is in sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    mockUseIsPaused.mockReturnValue(true);
    const { container } = render(<ContractPausedBanner />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('reappears when paused transitions from false back to true', () => {
    mockUseIsPaused.mockReturnValue(true);
    const { container, rerender } = render(<ContractPausedBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(container.firstChild).toBeEmptyDOMElement();
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('1');

    mockUseIsPaused.mockReturnValue(false);
    rerender(<ContractPausedBanner />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    mockUseIsPaused.mockReturnValue(true);
    rerender(<ContractPausedBanner />);
    expect(
      screen.getByText('ScoutOff is currently under maintenance.'),
    ).toBeInTheDocument();
  });
});
