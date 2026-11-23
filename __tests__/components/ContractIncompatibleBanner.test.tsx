import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useContractCompatibility', () => ({
  useContractCompatibility: jest.fn(),
}));

import { useContractCompatibility } from '@/hooks/useContractCompatibility';
import ContractIncompatibleBanner from '@/components/ContractIncompatibleBanner';

const mockUseCompat = useContractCompatibility as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ContractIncompatibleBanner', () => {
  it('renders nothing when compatible', () => {
    mockUseCompat.mockReturnValue({
      status: 'compatible',
      message: null,
      isIncompatible: false,
      isLoading: false,
    });
    const { container } = render(<ContractIncompatibleBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is unknown', () => {
    mockUseCompat.mockReturnValue({
      status: 'unknown',
      message: null,
      isIncompatible: false,
      isLoading: false,
    });
    const { container } = render(<ContractIncompatibleBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the alert with the provided message when incompatible', () => {
    mockUseCompat.mockReturnValue({
      status: 'incompatible',
      message: 'Please refresh to get the latest version.',
      isIncompatible: true,
      isLoading: false,
    });
    render(<ContractIncompatibleBanner />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Contract update required.')).toBeInTheDocument();
    expect(
      screen.getByText('Please refresh to get the latest version.'),
    ).toBeInTheDocument();
  });

  it('falls back to a generic message when none is provided', () => {
    mockUseCompat.mockReturnValue({
      status: 'incompatible',
      message: null,
      isIncompatible: true,
      isLoading: false,
    });
    render(<ContractIncompatibleBanner />);

    expect(
      screen.getByText(/out of sync with the deployed contract/i),
    ).toBeInTheDocument();
  });
});
