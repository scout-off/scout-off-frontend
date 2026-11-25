import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FraudFlagsStalenessBadge from '@/components/admin/FraudFlagsStalenessBadge';
import { fetchFraudFlagsStatus } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  fetchFraudFlagsStatus: jest.fn(),
}));

const mockFetch = fetchFraudFlagsStatus as jest.Mock;
const NOW = new Date('2026-01-01T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

describe('FraudFlagsStalenessBadge', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders a fresh state when the last run is recent', async () => {
    mockFetch.mockResolvedValue({
      evaluatedAt: NOW - 30 * 60 * 1000,
      highSeverityCount: 0,
    });
    render(<FraudFlagsStalenessBadge />);
    const badge = await screen.findByText(/Fraud flags: 30 minutes ago/);
    expect(badge).not.toHaveTextContent('stale');
    expect(badge).toHaveClass('text-gray-400');
  });

  it('shows the high-severity count when present', async () => {
    mockFetch.mockResolvedValue({
      evaluatedAt: NOW - HOUR,
      highSeverityCount: 2,
    });
    render(<FraudFlagsStalenessBadge />);
    const badge = await screen.findByText(/Fraud flags: 1 hour ago/);
    expect(badge).toHaveTextContent('2 high');
    expect(badge).toHaveClass('text-red-400');
  });

  it('renders a stale state once older than 6 hours', async () => {
    mockFetch.mockResolvedValue({
      evaluatedAt: NOW - 7 * HOUR,
      highSeverityCount: 0,
    });
    render(<FraudFlagsStalenessBadge />);
    const badge = await screen.findByText(/Fraud flags: 7 hours ago/);
    expect(badge).toHaveTextContent('stale');
    expect(badge).toHaveClass('text-yellow-400');
  });

  it('renders nothing when no run has ever happened', async () => {
    mockFetch.mockResolvedValue({ evaluatedAt: null, highSeverityCount: 0 });
    const { container } = render(<FraudFlagsStalenessBadge />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the status request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { container } = render(<FraudFlagsStalenessBadge />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
