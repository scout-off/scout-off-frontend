import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ValidatorChip from '@/components/player/ValidatorChip';

const mockCheckIsValidator = jest.fn();
jest.mock('@/lib/contract', () => ({
  checkIsValidator: (...args: unknown[]) => mockCheckIsValidator(...args),
}));

const mockFetchValidatorMilestoneCount = jest.fn();
const mockFetchAcademyForWallet = jest.fn();
jest.mock('@/lib/api', () => ({
  fetchValidatorMilestoneCount: (...args: unknown[]) =>
    mockFetchValidatorMilestoneCount(...args),
  fetchAcademyForWallet: (...args: unknown[]) =>
    mockFetchAcademyForWallet(...args),
}));

const ADDRESS = 'GVALIDATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TRUNCATED_ADDRESS = `${ADDRESS.slice(0, 8)}…${ADDRESS.slice(-4)}`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ValidatorChip', () => {
  it('shows the truncated address when the wallet belongs to no academy', async () => {
    mockCheckIsValidator.mockResolvedValue(true);
    mockFetchValidatorMilestoneCount.mockResolvedValue(3);
    mockFetchAcademyForWallet.mockResolvedValue(null);

    render(<ValidatorChip address={ADDRESS} />);

    await waitFor(() =>
      expect(screen.getByText(TRUNCATED_ADDRESS)).toBeInTheDocument(),
    );
    expect(screen.queryByText('FC Sahel')).not.toBeInTheDocument();
  });

  it('shows the academy name instead of the address when the wallet is a registered signer', async () => {
    mockCheckIsValidator.mockResolvedValue(true);
    mockFetchValidatorMilestoneCount.mockResolvedValue(5);
    mockFetchAcademyForWallet.mockResolvedValue({
      id: 'academy-1',
      name: 'FC Sahel',
      ownerWallet: ADDRESS,
      createdAt: 0,
      members: [],
    });

    render(<ValidatorChip address={ADDRESS} />);

    await waitFor(() =>
      expect(screen.getByText('FC Sahel')).toBeInTheDocument(),
    );
    expect(screen.queryByText(TRUNCATED_ADDRESS)).not.toBeInTheDocument();
  });

  it('falls back to address-only display when the academy lookup fails', async () => {
    mockCheckIsValidator.mockResolvedValue(true);
    mockFetchValidatorMilestoneCount.mockResolvedValue(null);
    mockFetchAcademyForWallet.mockResolvedValue(null);

    render(<ValidatorChip address={ADDRESS} />);

    await waitFor(() =>
      expect(screen.getByText(TRUNCATED_ADDRESS)).toBeInTheDocument(),
    );
  });
});
