jest.unmock('next-intl');

import React from 'react';
import { render, screen, fireEvent } from '@/__tests__/setup-providers-intl';
import ReferralPanel from '@/components/scout/ReferralPanel';
import { ToastProvider } from '@/components/ui/Toast';
import {
  generateReferralCode,
  getReferralStats,
  listReferralCodes,
} from '@/lib/api';

jest.mock('@/lib/api', () => ({
  generateReferralCode: jest.fn(),
  getReferralStats: jest.fn(),
  listReferralCodes: jest.fn(),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: 'GABC1234567890ABCDE1234567890ABCDE1234567890ABCDE123456',
  }),
}));

const mockGenerate = generateReferralCode as jest.MockedFunction<typeof generateReferralCode>;
const mockStats = getReferralStats as jest.MockedFunction<typeof getReferralStats>;
const mockList = listReferralCodes as jest.MockedFunction<typeof listReferralCodes>;

function axiosError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStats.mockResolvedValue({ totalCodes: 10, successfulReferrals: 0 });
  mockList.mockResolvedValue([]);
});

describe('ReferralPanel referral code limit (#1774)', () => {
  it('shows a localized message when the wallet holds too many unused codes', async () => {
    mockGenerate.mockRejectedValue(
      axiosError(409, {
        error: 'Referral code limit reached',
        code: 'REFERRAL_LIMIT_REACHED',
        limit: 10,
      }),
    );
    render(
      <ToastProvider>
        <ReferralPanel />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Generate Invite Link' }));

    expect(
      await screen.findByText('You already have 10 unused codes — share one of those first.'),
    ).toBeInTheDocument();
  });

  it('still shows the server message for other errors', async () => {
    mockGenerate.mockRejectedValue(axiosError(400, { error: 'scoutWallet is required' }));
    render(
      <ToastProvider>
        <ReferralPanel />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Generate Invite Link' }));

    expect(await screen.findByText('scoutWallet is required')).toBeInTheDocument();
  });
});
