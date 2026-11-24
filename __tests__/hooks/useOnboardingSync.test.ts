import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnboardingSync } from '@/hooks/useOnboardingSync';
import {
  saveOnboardingSubmission,
  getOnboardingSubmission,
  updateOnboardingSubmission,
  deleteOnboardingSubmission,
  isIndexedDbAvailable,
} from '@/lib/onboardingSyncStore';
import { submitSignedTransaction, isNetworkError } from '@/lib/sorobanRpc';

jest.mock('@/lib/onboardingSyncStore', () => ({
  saveOnboardingSubmission: jest.fn(),
  getOnboardingSubmission: jest.fn(),
  updateOnboardingSubmission: jest.fn(),
  deleteOnboardingSubmission: jest.fn(),
  isIndexedDbAvailable: jest.fn(),
}));
jest.mock('@/lib/sorobanRpc', () => ({
  submitSignedTransaction: jest.fn(),
  isNetworkError: jest.fn(),
}));

const mockGet = getOnboardingSubmission as jest.Mock;
const mockSave = saveOnboardingSubmission as jest.Mock;
const mockUpdate = updateOnboardingSubmission as jest.Mock;
const mockDelete = deleteOnboardingSubmission as jest.Mock;
const mockAvailable = isIndexedDbAvailable as jest.Mock;
const mockSubmit = submitSignedTransaction as jest.Mock;
const mockIsNetworkError = isNetworkError as jest.Mock;

const WALLET = 'GWALLET';
const pending = {
  wallet: WALLET,
  status: 'pending',
  retryCount: 0,
  signedXdr: 'XDR',
  ipfsHash: 'Qm',
  vitals: {},
};

describe('useOnboardingSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable.mockReturnValue(true);
    mockGet.mockResolvedValue(null);
    mockUpdate.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it('loads the stored submission on mount', async () => {
    mockGet.mockResolvedValue(pending);
    const { result } = renderHook(() => useOnboardingSync(WALLET));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(WALLET);
    expect(result.current.submission).toEqual(pending);
  });

  it('is a no-op when unauthenticated', async () => {
    const { result } = renderHook(() => useOnboardingSync(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.submission).toBeNull();

    await act(async () => {
      await result.current.queueSubmission({
        vitals: {} as never,
        ipfsHash: 'Qm',
        signedXdr: 'XDR',
      });
      await result.current.retryNow();
      await result.current.discard();
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('persists a queued submission', async () => {
    mockSave.mockResolvedValue(pending);
    const { result } = renderHook(() => useOnboardingSync(WALLET));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.queueSubmission({
        vitals: {} as never,
        ipfsHash: 'Qm',
        signedXdr: 'XDR',
      });
    });
    expect(mockSave).toHaveBeenCalledWith({
      wallet: WALLET,
      vitals: {},
      ipfsHash: 'Qm',
      signedXdr: 'XDR',
    });
    expect(result.current.submission).toEqual(pending);
  });

  it('flushes a queued submission when the browser comes back online', async () => {
    mockGet.mockResolvedValue(pending);
    mockSubmit.mockResolvedValue({ hash: 'TXHASH' });
    const { result } = renderHook(() => useOnboardingSync(WALLET));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(WALLET, {
        status: 'complete',
        txHash: 'TXHASH',
      }),
    );
    expect(mockSubmit).toHaveBeenCalledWith('XDR');
    expect(mockUpdate).toHaveBeenCalledWith(WALLET, {
      status: 'syncing',
      retryCount: 1,
    });
  });

  it('keeps the submission pending on a network error and fails otherwise', async () => {
    mockGet.mockResolvedValue(pending);
    mockSubmit.mockRejectedValue(new Error('offline'));
    mockIsNetworkError.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { result } = renderHook(() => useOnboardingSync(WALLET));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.retryNow();
    });
    expect(mockUpdate).toHaveBeenLastCalledWith(WALLET, {
      status: 'pending',
      lastError: 'offline',
    });

    await act(async () => {
      await result.current.retryNow();
    });
    expect(mockUpdate).toHaveBeenLastCalledWith(WALLET, {
      status: 'failed',
      lastError: 'offline',
    });
  });

  it('discards the stored submission', async () => {
    mockGet.mockResolvedValue(pending);
    const { result } = renderHook(() => useOnboardingSync(WALLET));
    await waitFor(() => expect(result.current.submission).toEqual(pending));

    await act(async () => {
      await result.current.discard();
    });
    expect(mockDelete).toHaveBeenCalledWith(WALLET);
    expect(result.current.submission).toBeNull();
  });
});
