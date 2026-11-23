import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useValidatorLeaderboard } from '@/hooks/useValidatorLeaderboard';
import type { ValidatorInfo } from '@/types';

const mockGetValidators = jest.fn();
const mockFetchValidatorMilestoneCount = jest.fn();
const mockFetchAcademyForWallet = jest.fn();

jest.mock('@/lib/contract', () => ({
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
}));

jest.mock('@/lib/api', () => ({
  fetchValidatorMilestoneCount: (...args: unknown[]) =>
    mockFetchValidatorMilestoneCount(...args),
  fetchAcademyForWallet: (...args: unknown[]) =>
    mockFetchAcademyForWallet(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const makeValidator = (over: Partial<ValidatorInfo> = {}): ValidatorInfo =>
  ({
    address: 'G'.padEnd(56, 'A'),
    addedAt: 1000,
    addedBy: 'G'.padEnd(56, 'B'),
    ...over,
  }) as unknown as ValidatorInfo;

describe('useValidatorLeaderboard', () => {
  beforeEach(() => {
    mockGetValidators.mockReset();
    mockFetchValidatorMilestoneCount.mockReset();
    mockFetchAcademyForWallet.mockReset();
  });

  it('starts with an empty list and loading true, then resolves', async () => {
    mockGetValidators.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useValidatorLeaderboard(), {
      wrapper,
    });

    expect(result.current.entries).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('builds entries combining approval counts and academy attribution', async () => {
    const v1 = makeValidator({ address: 'G'.padEnd(56, '1'), addedAt: 100 });
    const v2 = makeValidator({ address: 'G'.padEnd(56, '2'), addedAt: 200 });
    mockGetValidators.mockResolvedValueOnce([v1, v2]);
    mockFetchValidatorMilestoneCount.mockImplementation((addr: string) =>
      Promise.resolve(addr === v1.address ? 5 : 10),
    );
    mockFetchAcademyForWallet.mockImplementation((addr: string) =>
      Promise.resolve(addr === v1.address ? { name: 'Academy One' } : null),
    );

    const { result } = renderHook(() => useValidatorLeaderboard(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Ranked by approvalCount descending, so v2 (10) comes before v1 (5).
    expect(result.current.entries).toEqual([
      {
        address: v2.address,
        displayName: v2.address,
        isAcademy: false,
        approvalCount: 10,
        addedAt: 200,
      },
      {
        address: v1.address,
        displayName: 'Academy One',
        isAcademy: true,
        approvalCount: 5,
        addedAt: 100,
      },
    ]);
  });

  it('sorts validators with a null approvalCount to the bottom', async () => {
    const v1 = makeValidator({ address: 'G'.padEnd(56, '1') });
    const v2 = makeValidator({ address: 'G'.padEnd(56, '2') });
    const v3 = makeValidator({ address: 'G'.padEnd(56, '3') });
    mockGetValidators.mockResolvedValueOnce([v1, v2, v3]);
    mockFetchValidatorMilestoneCount.mockImplementation((addr: string) => {
      if (addr === v1.address) return Promise.resolve(null);
      if (addr === v2.address) return Promise.resolve(3);
      return Promise.resolve(7);
    });
    mockFetchAcademyForWallet.mockResolvedValue(null);

    const { result } = renderHook(() => useValidatorLeaderboard(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.address)).toEqual([
      v3.address,
      v2.address,
      v1.address,
    ]);
  });

  it('keeps two validators both at null approvalCount in original relative order', async () => {
    const v1 = makeValidator({ address: 'G'.padEnd(56, '1') });
    const v2 = makeValidator({ address: 'G'.padEnd(56, '2') });
    mockGetValidators.mockResolvedValueOnce([v1, v2]);
    mockFetchValidatorMilestoneCount.mockResolvedValue(null);
    mockFetchAcademyForWallet.mockResolvedValue(null);

    const { result } = renderHook(() => useValidatorLeaderboard(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.address)).toEqual([
      v1.address,
      v2.address,
    ]);
    expect(result.current.entries.every((e) => e.approvalCount === null)).toBe(
      true,
    );
  });

  it('surfaces an error message when getValidators fails', async () => {
    mockGetValidators.mockRejectedValue(new Error('contract unavailable'));

    const { result } = renderHook(() => useValidatorLeaderboard(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('contract unavailable');
    expect(result.current.entries).toEqual([]);
  });
});
