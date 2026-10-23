jest.unmock('next-intl');

import React from 'react';
import { render, screen, waitFor } from '@/__tests__/setup-providers-intl';
import { axe, toHaveNoViolations } from 'jest-axe';
import ReferralPanel from '@/components/scout/ReferralPanel';
import { ToastProvider } from '@/components/ui/Toast';
import {
  generateReferralCode,
  getReferralStats,
  listReferralCodes,
} from '@/lib/api';
import type { ReferralCode, ReferralStats } from '@/types';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api', () => ({
  generateReferralCode: jest.fn(),
  getReferralStats: jest.fn(),
  listReferralCodes: jest.fn(),
}));

// ReferralPanel reads the connected wallet directly via useWallet(), which
// needs a WalletProvider ancestor — mock it so the panel can generate/load
// codes for a fixed scout wallet without rendering a real provider.
jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: 'GABC1234567890ABCDE1234567890ABCDE1234567890ABCDE123456',
  }),
}));

const mockGenerateReferralCode = generateReferralCode as jest.MockedFunction<
  typeof generateReferralCode
>;
const mockGetReferralStats = getReferralStats as jest.MockedFunction<
  typeof getReferralStats
>;
const mockListReferralCodes = listReferralCodes as jest.MockedFunction<
  typeof listReferralCodes
>;

const STATS: ReferralStats = { totalCodes: 2, successfulReferrals: 1 };

function renderReferralPanel() {
  return render(
    <ToastProvider>
      <ReferralPanel />
    </ToastProvider>,
  );
}

function makeCode(code: string): ReferralCode {
  return {
    code,
    scoutWallet: 'GSCOUT',
    createdAt: Date.now() / 1000,
    usedBy: null,
    usedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReferralStats.mockResolvedValue(STATS);
  mockGenerateReferralCode.mockResolvedValue(makeCode('ABC123'));
  mockListReferralCodes.mockResolvedValue([]);
});

describe('ReferralPanel accessibility', () => {
  it('gives each per-row copy button a distinct, code-specific aria-label', async () => {
    renderReferralPanel();

    await screen.findByRole('button', { name: 'Generate Invite Link' });

    // Generate two codes so there are multiple otherwise-identical rows.
    const generateButton = screen.getByRole('button', {
      name: 'Generate Invite Link',
    });
    mockGenerateReferralCode.mockResolvedValueOnce(makeCode('FIRSTCODE'));
    generateButton.click();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Copy invite link for code FIRSTCODE',
        }),
      ).toBeInTheDocument(),
    );

    mockGenerateReferralCode.mockResolvedValueOnce(makeCode('SECONDCODE'));
    generateButton.click();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Copy invite link for code SECONDCODE',
        }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getByRole('button', {
        name: 'Copy invite link for code FIRSTCODE',
      }),
    ).toBeInTheDocument();

    // Visible text is unchanged for sighted users.
    expect(screen.getAllByText('Copy').length).toBeGreaterThanOrEqual(2);
  });

  it('has no axe violations once codes are present', async () => {
    mockGenerateReferralCode.mockResolvedValueOnce(makeCode('AXECODE'));
    const { container } = renderReferralPanel();

    const generateButton = await screen.findByRole('button', {
      name: 'Generate Invite Link',
    });
    generateButton.click();

    await screen.findByRole('button', {
      name: 'Copy invite link for code AXECODE',
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
