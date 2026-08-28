import { renderHook, act, waitFor } from '@testing-library/react';
import { useFeeDriftDetection } from '@/hooks/useFeeDriftDetection';
import { getContactFee } from '@/lib/contract';
import { CONTACT_FEE_XLM } from '@/lib/feeSchedule';

jest.mock('@/lib/contract', () => ({
  getContactFee: jest.fn(),
}));

const mockGetContactFee = getContactFee as jest.MockedFunction<typeof getContactFee>;

describe('useFeeDriftDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects drift when live contract fee differs from CONTACT_FEE_XLM', async () => {
    mockGetContactFee.mockResolvedValue(2); // Differs from CONTACT_FEE_XLM = 1

    const { result } = renderHook(() => useFeeDriftDetection());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasDrift).toBe(true);
    expect(result.current.liveContactFee).toBe(2);
    expect(result.current.expectedContactFee).toBe(CONTACT_FEE_XLM);
    expect(result.current.warningMessage).toContain('On-chain fee drift detected');
    expect(result.current.warningMessage).toContain('currently 2 XLM');
    expect(result.current.error).toBeNull();
  });

  it('reports no drift when live contract fee matches CONTACT_FEE_XLM', async () => {
    mockGetContactFee.mockResolvedValue(1);

    const { result } = renderHook(() => useFeeDriftDetection());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasDrift).toBe(false);
    expect(result.current.liveContactFee).toBe(1);
    expect(result.current.warningMessage).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('handles errors when fetching on-chain contact fee', async () => {
    mockGetContactFee.mockRejectedValue(new Error('RPC node unavailable'));

    const { result } = renderHook(() => useFeeDriftDetection());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasDrift).toBe(false);
    expect(result.current.liveContactFee).toBeNull();
    expect(result.current.error).toBe('RPC node unavailable');
  });

  it('supports manual refetching', async () => {
    mockGetContactFee.mockResolvedValueOnce(1).mockResolvedValueOnce(3);

    const { result } = renderHook(() => useFeeDriftDetection());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasDrift).toBe(false);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.hasDrift).toBe(true));
    expect(result.current.liveContactFee).toBe(3);
  });
});
