import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RedirectReasonBanner from '@/components/ui/RedirectReasonBanner';
import { REDIRECT_REASONS } from '@/lib/redirectReason';

describe('RedirectReasonBanner', () => {
  it('renders nothing when there is no reason', () => {
    const { container } = render(<RedirectReasonBanner reason={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for an unrecognized reason', () => {
    const { container } = render(
      <RedirectReasonBanner reason="something-unknown" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the wallet-required explanation', () => {
    render(<RedirectReasonBanner reason="wallet-required" />);
    expect(
      screen.getByText(REDIRECT_REASONS['wallet-required']),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the subscription-expired explanation', () => {
    render(<RedirectReasonBanner reason="subscription-expired" />);
    expect(
      screen.getByText(REDIRECT_REASONS['subscription-expired']),
    ).toBeInTheDocument();
  });

  it('dismisses when the dismiss button is clicked', () => {
    render(<RedirectReasonBanner reason="wallet-required" />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(
      screen.queryByText(REDIRECT_REASONS['wallet-required']),
    ).not.toBeInTheDocument();
  });
});
