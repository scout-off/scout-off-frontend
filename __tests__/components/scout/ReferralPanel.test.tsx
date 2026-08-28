import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReferralPanel from '@/components/scout/ReferralPanel';
import {
  generateReferralCode,
  getReferralStats,
  listReferralCodes,
} from '@/lib/api';
import type { ReferralCode, ReferralStats } from '@/types';

jest.mock('@/lib/api', () => ({
  generateReferralCode: jest.fn(),
  getReferralStats: jest.fn(),
  listReferralCodes: jest.fn(),
}));

const mockShow = jest.fn();

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
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

const STATS: ReferralStats = { totalCodes: 0, successfulReferrals: 0 };

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
  mockListReferralCodes.mockResolvedValue([]);
  mockGenerateReferralCode.mockResolvedValue(makeCode('DEFAULT'));
});

describe('ReferralPanel toast errors', () => {
  it('shows an error toast when referral stats fail to load', async () => {
    mockGetReferralStats.mockRejectedValueOnce(new Error('stats failed'));

    render(<ReferralPanel />);

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledWith({
        message: 'Failed to load referral stats.',
        variant: 'error',
      });
    });
  });

  it('shows an inline error and clears generating state when invite-link generation fails', async () => {
    mockGenerateReferralCode.mockRejectedValueOnce(
      new Error('generate failed'),
    );

    render(<ReferralPanel />);

    const generateButton = await screen.findByRole('button', {
      name: 'Generate Invite Link',
    });

    fireEvent.click(generateButton);

    expect(generateButton).toBeDisabled();

    await waitFor(() => {
      expect(
        screen.getByText('Failed to generate an invite link. Please try again.'),
      ).toBeInTheDocument();
    });

    await waitFor(() => expect(generateButton).not.toBeDisabled());
  });

  it('surfaces the server-provided error message when generation is rejected by the API', async () => {
    const axios = require('axios');
    const apiError = Object.assign(new Error('Request failed with status code 400'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error:
            'Bot-protection challenge is required. Please complete the challenge and try again.',
        },
      },
    });
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    mockGenerateReferralCode.mockRejectedValueOnce(apiError);

    render(<ReferralPanel />);

    const generateButton = await screen.findByRole('button', {
      name: 'Generate Invite Link',
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Bot-protection challenge is required. Please complete the challenge and try again.',
        ),
      ).toBeInTheDocument();
    });
  });
});

describe('ReferralPanel invite URL format', () => {
  it('renders the invite URL as <baseUrl>/scout/subscribe?ref=<code>', async () => {
    mockGenerateReferralCode.mockResolvedValueOnce(makeCode('MYCODE123'));
    render(<ReferralPanel />);

    const generateButton = await screen.findByRole('button', {
      name: 'Generate Invite Link',
    });
    fireEvent.click(generateButton);

    // Derive the expected base URL from window.location, the same way the
    // component does, so this test stays valid across jsdom test hosts.
    const expectedUrl = `${window.location.protocol}//${window.location.host}/scout/subscribe?ref=MYCODE123`;

    await waitFor(() =>
      expect(screen.getByText(expectedUrl)).toBeInTheDocument(),
    );

    // Exact-match the full string, so a change to the path segment or the
    // `ref` query param name (not just the code) fails this test.
    expect(screen.getByText(expectedUrl).textContent).toBe(expectedUrl);
    expect(expectedUrl).toBe('http://localhost/scout/subscribe?ref=MYCODE123');
  });
});

describe('ReferralPanel CSV export', () => {
  it('exports all loaded codes as CSV from the visible export button, including codes hidden by pagination', async () => {
    const codes = Array.from({ length: 6 }, (_, i) => makeCode(`CODE${i + 1}`));
    const firstCode = codes[0].code;
    const finalCode = codes[codes.length - 1].code;
    const createObjectURLSpy = jest.fn(() => 'blob:referral-export');
    const revokeObjectURLSpy = jest.fn();
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;

    try {
      (
        window.URL as typeof window.URL & {
          createObjectURL?: typeof URL.createObjectURL;
        }
      ).createObjectURL = createObjectURLSpy as typeof URL.createObjectURL;
      (
        window.URL as typeof window.URL & {
          revokeObjectURL?: typeof URL.revokeObjectURL;
        }
      ).revokeObjectURL = revokeObjectURLSpy as typeof URL.revokeObjectURL;

      mockListReferralCodes.mockResolvedValueOnce(codes);
      render(<ReferralPanel />);

      const exportButton = await screen.findByRole('button', {
        name: 'Export as CSV',
      });

      await waitFor(() => expect(exportButton).toBeEnabled());
      expect(
        screen.getByRole('button', {
          name: `Copy invite link for code ${firstCode}`,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: `Copy invite link for code ${finalCode}`,
        }),
      ).not.toBeInTheDocument();

      fireEvent.click(exportButton);

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);

      const csvContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });

      expect(csvContent).toContain(
        'code,invite URL,created date,redeemed status,redeemed date',
      );
      expect(csvContent).toContain(firstCode);
      expect(csvContent).toContain(finalCode);
    } finally {
      clickSpy.mockRestore();

      if (typeof originalCreateObjectURL === 'function') {
        (
          window.URL as typeof window.URL & {
            createObjectURL?: typeof URL.createObjectURL;
          }
        ).createObjectURL = originalCreateObjectURL;
      } else {
        delete (
          window.URL as typeof window.URL & {
            createObjectURL?: typeof URL.createObjectURL;
          }
        ).createObjectURL;
      }

      if (typeof originalRevokeObjectURL === 'function') {
        (
          window.URL as typeof window.URL & {
            revokeObjectURL?: typeof URL.revokeObjectURL;
          }
        ).revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete (
          window.URL as typeof window.URL & {
            revokeObjectURL?: typeof URL.revokeObjectURL;
          }
        ).revokeObjectURL;
      }
    }
  });
});

describe('ReferralPanel pagination', () => {
  it('loads a scout’s previously generated codes on mount', async () => {
    mockListReferralCodes.mockResolvedValueOnce([makeCode('EXISTINGCODE')]);
    render(<ReferralPanel />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Copy invite link for code EXISTINGCODE',
        }),
      ).toBeInTheDocument(),
    );
  });

  it('caps the visible list at 5 codes with a "Show more" control, revealing the rest on click', async () => {
    const codes = Array.from({ length: 8 }, (_, i) => makeCode(`CODE${i + 1}`));
    mockListReferralCodes.mockResolvedValueOnce(codes);
    render(<ReferralPanel />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Copy invite link for code CODE1' }),
      ).toBeInTheDocument(),
    );

    // Only the first 5 are rendered up front.
    for (let i = 1; i <= 5; i++) {
      expect(
        screen.getByRole('button', {
          name: `Copy invite link for code CODE${i}`,
        }),
      ).toBeInTheDocument();
    }
    for (let i = 6; i <= 8; i++) {
      expect(
        screen.queryByRole('button', {
          name: `Copy invite link for code CODE${i}`,
        }),
      ).not.toBeInTheDocument();
    }

    const showMore = screen.getByRole('button', {
      name: /show more \(3 remaining\)/i,
    });
    fireEvent.click(showMore);

    for (let i = 6; i <= 8; i++) {
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: `Copy invite link for code CODE${i}`,
          }),
        ).toBeInTheDocument(),
      );
    }

    // Every remaining code is now visible, so the control disappears.
    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument();
  });

  it('does not show a "Show more" control for 5 or fewer codes', async () => {
    mockListReferralCodes.mockResolvedValueOnce([makeCode('ONLYCODE')]);
    render(<ReferralPanel />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Copy invite link for code ONLYCODE',
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument();
  });
});
