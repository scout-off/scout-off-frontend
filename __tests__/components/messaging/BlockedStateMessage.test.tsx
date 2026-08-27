import React from 'react';
import { render, screen } from '@testing-library/react';
import BlockedStateMessage from '@/components/messaging/BlockedStateMessage';

// Mock the moderation module
jest.mock('@/lib/messaging/moderation', () => ({
  isBlocked: jest.fn(),
}));

import { isBlocked } from '@/lib/messaging/moderation';

describe('BlockedStateMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when user is not blocked', () => {
    (isBlocked as jest.Mock).mockReturnValue(false);
    render(<BlockedStateMessage targetId="player123" targetType="player" action="contact" />);
    expect(screen.queryByText(/You have blocked this player/)).not.toBeInTheDocument();
  });

  it('renders blocked message when user is blocked', () => {
    (isBlocked as jest.Mock).mockReturnValue(true);
    render(<BlockedStateMessage targetId="player123" targetType="player" action="contact" />);
    expect(screen.getByText(/You have blocked this player/)).toBeInTheDocument();
    expect(screen.getByText(/You cannot contact this player/)).toBeInTheDocument();
  });

  it('shows support contact link for appeal', () => {
    (isBlocked as jest.Mock).mockReturnValue(true);
    render(<BlockedStateMessage targetId="player123" targetType="player" action="contact" />);
    const supportLink = screen.getByText(/Contact Support for Review/);
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveAttribute('href');
  });

  it('displays correct action text for message action', () => {
    (isBlocked as jest.Mock).mockReturnValue(true);
    render(<BlockedStateMessage targetId="player123" targetType="player" action="message" />);
    expect(screen.getByText(/You cannot send a message/)).toBeInTheDocument();
  });

  it('displays correct action text for view action', () => {
    (isBlocked as jest.Mock).mockReturnValue(true);
    render(<BlockedStateMessage targetId="player123" targetType="player" action="view" />);
    expect(screen.getByText(/You cannot view this profile/)).toBeInTheDocument();
  });

  it('includes target type in message', () => {
    (isBlocked as jest.Mock).mockReturnValue(true);
    render(<BlockedStateMessage targetId="scout123" targetType="scout" action="contact" />);
    expect(screen.getByText(/You have blocked this scout/)).toBeInTheDocument();
  });
});
