'use client';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { usePayToContact } from '@/hooks/usePayToContact';
import type { ContactDetails } from '@/types';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  payToContact: jest.fn(),
  getSubscription: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import { payToContact, getSubscription } from '@/lib/contract';

const mockUseWallet = useWallet as jest.Mock;
const mockPayToContact = payToContact as jest.Mock;
const mockGetSubscription = getSubscription as jest.Mock;

const PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const FUTURE_EXPIRY = Date.now() / 1000 + 10_000;
const PAST_EXPIRY = Date.now() / 1000 - 10_000;

describe('usePayToContact', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseWallet.mockReturnValue({ publicKey: PUBLIC_KEY });
  });

  test('successful unlock returns ContactDetails', async () => {
    const mockContact: ContactDetails = {
      email: 'alice@example.com',
      phone: '+1234567890',
    };
    mockGetSubscription.mockResolvedValue({
      scout: PUBLIC_KEY,
      tier: 'pro',
      expiresAt: FUTURE_EXPIRY,
    });
    mockPayToContact.mockResolvedValue(mockContact);

    const { result } = renderHook(() => usePayToContact());

    let contact: ContactDetails | undefined;
    await act(async () => {
      contact = await result.current.unlock('player-1');
    });

    expect(mockGetSubscription).toHaveBeenCalledWith(PUBLIC_KEY);
    expect(mockPayToContact).toHaveBeenCalledWith(PUBLIC_KEY, 'player-1');
    expect(contact).toEqual(mockContact);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('subscription expired (error code 8) sets correct error message', async () => {
    mockGetSubscription.mockResolvedValue({
      scout: PUBLIC_KEY,
      tier: 'basic',
      expiresAt: PAST_EXPIRY,
    });

    const { result } = renderHook(() => usePayToContact());

    await expect(
      act(async () => {
        await result.current.unlock('player-1');
      }),
    ).rejects.toThrow('Your subscription has expired');

    expect(result.current.error).toBe(
      'Your subscription has expired. Please renew it to access contact details.',
    );
    expect(mockPayToContact).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  test('contract paused (error code 9) sets correct error message', async () => {
    mockGetSubscription.mockResolvedValue({
      scout: PUBLIC_KEY,
      tier: 'pro',
      expiresAt: FUTURE_EXPIRY,
    });
    mockPayToContact.mockRejectedValue(new Error('ContractPaused'));

    const { result } = renderHook(() => usePayToContact());

    await expect(
      act(async () => {
        await result.current.unlock('player-1');
      }),
    ).rejects.toThrow('ContractPaused');

    expect(result.current.error).toBe('ContractPaused');
    expect(result.current.loading).toBe(false);
  });
});
