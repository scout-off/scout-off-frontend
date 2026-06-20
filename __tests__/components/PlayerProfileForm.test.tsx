import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerProfileForm from '@/components/player/PlayerProfileForm';
import { AFRICAN_REGIONS } from '@/lib/regions';
// NOTE: Import the named buildRegisterPlayer explicitly so subsequent
// maintainers don't "auto-fix" this to `import * as contract from '@/lib/contract'`.
// The mock below is registered against the same module path the component reads from.
import { buildRegisterPlayer } from '@/lib/contract';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';

const mockedRpc = jest.requireMock('@/lib/stellar').rpc as {
  getTransaction: jest.MockedFunction<(hash: string) => Promise<unknown>>;
  [k: string]: unknown;
};

// Mock next-intl so the component can resolve translations without loading its
// ESM runtime. We resolve against the real messages/en.json so DOM queries
// match rendered English strings rather than i18n key paths.
jest.mock('next-intl', () => {
  const en = require('@/messages/en.json');
  function lookup(obj: any, parts: string[]): string {
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return parts.join('.');
    }
    return typeof cur === 'string' ? cur : parts.join('.');
  }
  return {
    __esModule: true,
    useTranslations:
      (namespace = '') =>
      (key: string): string => {
        const parts = namespace
          ? [...namespace.split('.'), ...key.split('.')]
          : key.split('.');
        return lookup(en, parts);
      },
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

jest.mock('@/components/ui/VideoUpload', () => ({
  __esModule: true,
  default: ({ onUpload }: { onUpload: (cid: string) => void }) => (
    <button type="button" onClick={() => onUpload('Qmtestcid1234567890')}>
      Upload highlight reel
    </button>
  ),
}));

jest.mock('@/lib/stellar', () => ({
  rpc: {
    getAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    // Default: tx included in a closed ledger. Per-test overrides via
    // `mockedRpc.getTransaction.mockResolvedValueOnce(...)`.
    getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
  },
  NETWORK: 'TESTNET',
  BASE_FEE: '100',
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  buildRegisterPlayer: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitize: (v: string) => v,
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseIsPaused = useIsPaused as jest.MockedFunction<
  typeof useIsPaused
>;
const mockedBuildRegisterPlayer = buildRegisterPlayer as jest.MockedFunction<
  typeof buildRegisterPlayer
>;

const WALLET = 'GABC123PUBLICKEY';
const REGION_VALUE = AFRICAN_REGIONS[0].value;

beforeEach(() => {
  jest.clearAllMocks();
  mockedBuildRegisterPlayer.mockResolvedValue('xdr-string');
  mockedUseWallet.mockReturnValue({
    publicKey: WALLET,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn().mockResolvedValue({
      hash: 'tx-hash',
      id: 'player-id',
    }),
  } as any);
  mockedUseIsPaused.mockReturnValue(false);
  // Reset getTransaction to the happy-path default after jest.clearAllMocks()
  // — clearAllMocks nukes every mock's implementation between tests.
  mockedRpc.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
});
// Matches the button in either the submitting phase ("Register on Stellar")
// or the confirming phase ("Confirming on Stellar…"). The post-submit hardening
// gates onSuccess behind the inclusion polling, so the button text swaps to
// the confirming translation while we wait for the ledger to close.
const SUBMIT_REGEX = /register|confirming/i;

function renderForm(onSuccess = jest.fn()) {
  return render(<PlayerProfileForm onSuccess={onSuccess} />);
}

function fillRequiredFields({ nationality }: { nationality: string }) {
  fireEvent.change(screen.getByPlaceholderText(/full name/i), {
    target: { value: 'Ada Lovelace' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter your age/i), {
    target: { value: '21' },
  });
  fireEvent.change(screen.getByPlaceholderText(/enter your nationality/i), {
    target: { value: nationality },
  });
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[0], { target: { value: 'ST' } });
  fireEvent.change(selects[1], { target: { value: REGION_VALUE } });
  fireEvent.click(
    screen.getByRole('button', { name: /upload highlight reel/i }),
  );
}

describe('PlayerProfileForm — nationality field (Issue #301)', () => {
  it('renders a Nationality input', () => {
    renderForm();
    expect(
      screen.getByPlaceholderText(/enter your nationality/i),
    ).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when nationality is empty', async () => {
    renderForm();

    fillRequiredFields({ nationality: '' });

    const submit = screen.getByRole('button', { name: SUBMIT_REGEX });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(
      await screen.findByText(/Nationality is required/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('shows a validation error when nationality is only whitespace', async () => {
    renderForm();
    fillRequiredFields({ nationality: '   ' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    expect(
      await screen.findByText(/Nationality is required/i),
    ).toBeInTheDocument();
    expect(mockedBuildRegisterPlayer).not.toHaveBeenCalled();
  });

  it('passes the entered nationality to buildRegisterPlayer', async () => {
    renderForm();

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    await waitFor(() =>
      expect(mockedBuildRegisterPlayer).toHaveBeenCalledTimes(1),
    );

    const [, vitals] = mockedBuildRegisterPlayer.mock.calls[0];
    expect(vitals).toEqual(
      expect.objectContaining({
        name: 'Ada Lovelace',
        age: 21,
        position: 'ST',
        region: REGION_VALUE,
        nationality: 'Nigerian',
      }),
    );
  });

  it('does not hardcode nationality as an empty string anywhere in the vitals', async () => {
    renderForm();
    fillRequiredFields({ nationality: 'Kenyan' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    await waitFor(() =>
      expect(mockedBuildRegisterPlayer).toHaveBeenCalled(),
    );
    const [, vitals] = mockedBuildRegisterPlayer.mock.calls[0];
    expect(vitals.nationality).toBe('Kenyan');
    expect(vitals.nationality).not.toBe('');
  });
});

describe('PlayerProfileForm — post-submit inclusion hardening', () => {
  it('does not call onSuccess until rpc.getTransaction reports SUCCESS', async () => {
    // Simulate the realistic 3-5s ledger latency: rpc returns PENDING twice,
    // then SUCCESS.
    mockedRpc.getTransaction
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });

    const onSuccess = jest.fn();
    renderForm(onSuccess);

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    // Wait for inclusion to complete — only then is onSuccess called.
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), {
      timeout: 5_000,
    });
    expect(mockedRpc.getTransaction).toHaveBeenCalledWith('tx-hash');
    expect(mockedRpc.getTransaction.mock.calls.length).toBeGreaterThanOrEqual(
      3,
    );
    // On the success path the submit button must stay locked (label still
    // "Confirming on Stellar\u2026") so the user cannot accidentally
    // double-pay during the gap between onSuccess and the parent page's
    // SWR refetch unmounting the form.
    expect(
      screen.getByRole('button', { name: /confirming/i }),
    ).toBeDisabled();
  });

  it('surfaces a form error and does not call onSuccess when the ledger reports FAILED', async () => {
    mockedRpc.getTransaction.mockResolvedValueOnce({ status: 'FAILED' });

    const onSuccess = jest.fn();
    renderForm(onSuccess);

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    await waitFor(() => expect(onSuccess).not.toHaveBeenCalled());
    // The error text comes from the FAILED check inside waitForInclusion; the
    // user must see this so they understand why the form bounced back.
    expect(
      await screen.findByText(/FAILED on-ledger/i),
    ).toBeInTheDocument();
    expect(mockedRpc.getTransaction).toHaveBeenCalledWith('tx-hash');
  });

  it('keeps the submit button busy (and never calls onSuccess) while polling indefinitely', async () => {
    // Real Soroban RPC can keep returning NOT_FOUND for many seconds while a
    // tx propagates; we must not let the form un-stick mid-poll or invite a
    // double-pay. Note: the polling timeout path itself is intentionally
    // covered only manually (DEFAULT_TIMEOUT_MS = 30s) so we don't spend
    // 30s of Jest time on every CI run to assert it.
    let pendingReject: (err: Error) => void = () => {};
    mockedRpc.getTransaction.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          pendingReject = reject;
        }),
    );

    const onSuccess = jest.fn();
    renderForm(onSuccess);

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    await waitFor(() =>
      expect(mockedRpc.getTransaction).toHaveBeenCalledWith('tx-hash'),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: SUBMIT_REGEX }),
    ).toBeDisabled();

    // Unblock the dangling promise so Jest exits cleanly even if the test
    // file's lifecycle ends before the AbortController fires.
    pendingReject(new DOMException('Aborted', 'AbortError'));
  });

  it('aborts the inclusion poll cleanly when the component unmounts mid-flight', async () => {
    // Never resolve → poll would otherwise loop forever.
    mockedRpc.getTransaction.mockImplementationOnce(
      () => new Promise(() => {}),
    );

    const onSuccess = jest.fn();
    const { unmount } = renderForm(onSuccess);

    fillRequiredFields({ nationality: 'Nigerian' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_REGEX }));
    });

    // Confirm we're in the confirming phase (busy button).
    expect(
      screen.getByRole('button', { name: SUBMIT_REGEX }),
    ).toBeDisabled();

    // Unmount. The useEffect cleanup should abort the AbortController and the
    // waitForInclusion promise should reject with AbortError. The component
    // catches it and silently returns, so onSuccess never fires — preferable
    // to throwing in a now-unmounted component.
    unmount();

    // Give the micro-task queue a chance to drain. The test passes if no
    // "state update on unmounted" warnings were thrown (Jest fails on those).
    await act(async () => {});
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
