import { renderHook, act } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getSubscription: jest.fn(),
  buildPayToContact: jest.fn(),
  PLATFORM_CONTACT_FEE_XLM: 1,
}));

// ── Typed handles ─────────────────────────────────────────────────────────────

import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import { getSubscription, buildPayToContact } from '@/lib/contract';
import { usePayToContact } from '@/hooks/usePayToContact';

const mockUseWallet = useWallet as jest.Mock;
const mockUseToast = useToast as jest.Mock;
const mockGetSubscription = getSubscription as jest.Mock;
const mockBuildPayToContact = buildPayToContact as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCOUT_KEY = 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
const PLAYER_ID = 'player-abc';
const FUTURE = Math.floor(Date.now() / 1000) + 86_400 * 30;
const PAST = Math.floor(Date.now() / 1000) - 1000;

interface WalletOverrides {
  publicKey?: string | null;
  xlmBalance?: string | null;
  signAndSubmit?: jest.Mock;
}

// Use explicit `in` checks so callers can pass null/undefined intentionally.
function makeWallet(overrides: WalletOverrides = {}) {
  const signAndSubmit =
    overrides.signAndSubmit ?? jest.fn().mockResolvedValue(undefined);
  mockUseWallet.mockReturnValue({
    publicKey: 'publicKey' in overrides ? overrides.publicKey : SCOUT_KEY,
    xlmBalance: 'xlmBalance' in overrides ? overrides.xlmBalance : '5.0000000',
    signAndSubmit,
  });
  return { signAndSubmit };
}

function makeShow() {
  const show = jest.fn();
  mockUseToast.mockReturnValue({ show });
  return show;
}

function activeSubscription() {
  mockGetSubscription.mockResolvedValue({
    scout: SCOUT_KEY,
    tier: 'pro',
    expiresAt: FUTURE,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
});

// ── Subscription gate ─────────────────────────────────────────────────────────

describe('usePayToContact — subscription gate', () => {
  test('expired subscription: shows error toast and does not call buildPayToContact', async () => {
    const show = makeShow();
    makeWallet();
    mockGetSubscription.mockResolvedValue({
      scout: SCOUT_KEY,
      tier: 'pro',
      expiresAt: PAST,
    });

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('active subscription'),
      }),
    );
    expect(result.current.error).toMatch(/active subscription/i);
    expect(result.current.loading).toBe(false);
  });

  test('null subscription: shows error toast and does not call buildPayToContact', async () => {
    const show = makeShow();
    makeWallet();
    mockGetSubscription.mockResolvedValue(null);

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('active subscription'),
      }),
    );
  });

  test('getSubscription failure: surfaces error toast and does not call buildPayToContact', async () => {
    const show = makeShow();
    makeWallet();
    mockGetSubscription.mockRejectedValue(new Error('RPC timeout'));

    const { result } = renderHook(() => usePayToContact());
    await act(async () => {
      try { await result.current.unlock(PLAYER_ID); } catch {}
    });

    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(result.current.loading).toBe(false);
  });
});

// ── Balance gate ──────────────────────────────────────────────────────────────

describe('usePayToContact — balance gate', () => {
  test('balance below fee: shows Insufficient XLM toast and does not call buildPayToContact', async () => {
    const show = makeShow();
    makeWallet({ xlmBalance: '0.5000000' });
    activeSubscription();

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('Insufficient XLM'),
      }),
    );
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('1 XLM'),
      }),
    );
    expect(result.current.error).toMatch(/insufficient xlm/i);
    expect(result.current.loading).toBe(false);
  });

  test('null xlmBalance is treated as 0 and blocks the transaction', async () => {
    const show = makeShow();
    makeWallet({ xlmBalance: null });
    activeSubscription();

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('Insufficient XLM'),
      }),
    );
  });

  test('balance exactly equal to the fee passes through', async () => {
    makeShow();
    const { signAndSubmit } = makeWallet({ xlmBalance: '1.0000000' });
    activeSubscription();
    mockBuildPayToContact.mockResolvedValue('SOME_XDR');

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).toHaveBeenCalled();
    expect(signAndSubmit).toHaveBeenCalledWith('SOME_XDR');
  });
});

// ── Validation ordering ───────────────────────────────────────────────────────

describe('usePayToContact — validation order', () => {
  test('subscription check fires before balance check: subscription error wins when both fail', async () => {
    const show = makeShow();
    makeWallet({ xlmBalance: '0.1' });
    mockGetSubscription.mockResolvedValue({
      scout: SCOUT_KEY,
      tier: 'pro',
      expiresAt: PAST,
    });

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('active subscription'),
      }),
    );
    expect(mockBuildPayToContact).not.toHaveBeenCalled();
  });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe('usePayToContact — success path', () => {
  test('builds and signs the transaction when both checks pass', async () => {
    makeShow();
    const { signAndSubmit } = makeWallet({ xlmBalance: '10.0000000' });
    activeSubscription();
    mockBuildPayToContact.mockResolvedValue('SIGNED_XDR');

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockBuildPayToContact).toHaveBeenCalledWith(SCOUT_KEY, PLAYER_ID);
    expect(signAndSubmit).toHaveBeenCalledWith('SIGNED_XDR');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('loading is false after a successful unlock', async () => {
    makeShow();
    makeWallet();
    activeSubscription();
    mockBuildPayToContact.mockResolvedValue('XDR');

    const { result } = renderHook(() => usePayToContact());

    expect(result.current.loading).toBe(false);

    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(result.current.loading).toBe(false);
  });

  test('wallet not connected: shows error and skips subscription + transaction', async () => {
    const show = makeShow();
    makeWallet({ publicKey: null });

    const { result } = renderHook(() => usePayToContact());
    await act(async () => { await result.current.unlock(PLAYER_ID); });

    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockBuildPayToContact).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('Wallet not connected'),
      }),
    );
  });
});
