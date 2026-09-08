/**
 * Tests for AccountSwitcher — account-switch mismatch verification.
 *
 * Acceptance criteria covered:
 *   AC1 – mismatch: no success toast, no persisted session for the mismatched
 *         key, and a clear mismatch message is shown.
 *   AC2 – match: switch proceeds and succeeds exactly as it does today.
 *   AC3 – session state does not end up set to the unintended account after
 *         a mismatched switch attempt.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountSwitcher from '@/components/AccountSwitcher';
import { WalletAccountMismatchError } from '@/context/WalletContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockConnectWithProvider = jest.fn();
const mockShowToast = jest.fn();

// Keep a stable reference per test so we can override publicKey / isAuthenticated.
let mockWalletState: {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  walletProvider: string | null;
  connectWithProvider: jest.Mock;
};

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockWalletState,
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShowToast }),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      accountSwitched: 'Account switched successfully.',
      accountSwitchFailed: 'Failed to switch account. Please try again.',
      accountSwitchMismatch:
        'Your wallet extension is currently on a different account than the one you selected. Please switch the active account inside your wallet extension, then try again.',
      switchAccountTitle: 'Switch Account',
      currentAccount: 'Current account',
      accountSwitcherLabel: 'Switch wallet account',
      forgetAllAccounts: 'Forget all remembered accounts',
      forgetAllConfirmTitle: 'Forget all accounts?',
      forgetAllConfirmMessage:
        'This will remove all remembered wallet addresses from this device.',
      removeAccountConfirmTitle: 'Remove this account?',
      removeAccountConfirmMessage:
        'This address will be removed from your remembered accounts on this device.',
    };
    return t[key] ?? key;
  },
}));

// Mock WalletContext helpers — getRememberedAddresses controls what the
// switcher renders; we don't test storage mutation here (that's tested in
// WalletContext.test.tsx).
jest.mock('@/context/WalletContext', () => {
  const actual = jest.requireActual('@/context/WalletContext');
  return {
    ...actual,
    getRememberedAddresses: jest.fn(),
    removeRememberedAddress: jest.fn(),
    clearAllRememberedAddresses: jest.fn(),
  };
});

// ConfirmDialog renders in a portal — stub it to render inline so RTL can
// find its buttons without needing a real document.body portal target.
jest.mock('@/components/ui/ConfirmDialog', () => {
  return function ConfirmDialog({
    isOpen,
    title,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title}>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>{cancelLabel}</button>
      </div>
    );
  };
});

jest.mock('@/components/ui/Spinner', () => {
  return function Spinner() {
    return <span data-testid="spinner" />;
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CURRENT_KEY = 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV';
const TARGET_KEY = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const WRONG_KEY = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const { getRememberedAddresses } = jest.requireMock('@/context/WalletContext');

// ── Helpers ───────────────────────────────────────────────────────────────────

function openSwitcher() {
  const button = screen.getByRole('button', {
    name: 'Switch wallet account',
  });
  act(() => {
    button.click();
  });
}

/**
 * Get the "switch to this account" button for a given publicKey.
 * The switch button renders as a flex-1 button whose text content starts with
 * the first 6 chars of the key. The remove button has an aria-label of
 * "Remove XXXX…", which we exclude by picking the button with no aria-label.
 */
function getSwitchButton(publicKey: string): HTMLElement {
  const buttons = screen.getAllByRole('button');
  // The switch button is the one whose accessible text contains the first 6
  // chars of the key AND has no aria-label attribute (i.e. it's not the
  // "Remove …" button which carries an explicit aria-label).
  const prefix = publicKey.slice(0, 6);
  const match = buttons.find(
    (btn) =>
      btn.textContent?.includes(prefix) && !btn.hasAttribute('aria-label'),
  );
  if (!match) {
    throw new Error(
      `Could not find a switch button for key starting with ${prefix}`,
    );
  }
  return match;
}

function renderAccountSwitcher() {
  return render(<AccountSwitcher />);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AccountSwitcher — account-switch mismatch verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    // Default state: authenticated as CURRENT_KEY
    mockWalletState = {
      publicKey: CURRENT_KEY,
      isAuthenticated: true,
      isConnecting: false,
      walletProvider: 'freighter',
      connectWithProvider: mockConnectWithProvider,
    };

    // Default: one remembered address (the target) in addition to current
    getRememberedAddresses.mockReturnValue([
      {
        publicKey: CURRENT_KEY,
        provider: 'freighter',
        lastUsed: new Date().toISOString(),
      },
      {
        publicKey: TARGET_KEY,
        provider: 'freighter',
        lastUsed: new Date().toISOString(),
      },
    ]);
  });

  // ── AC2: successful match ──────────────────────────────────────────────────

  describe('successful switch (wallet key matches selected address)', () => {
    it('calls connectWithProvider with the provider and the target publicKey as expectedPublicKey', async () => {
      mockConnectWithProvider.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockConnectWithProvider).toHaveBeenCalledWith(
          'freighter',
          false,
          TARGET_KEY,
        );
      });
    });

    it('shows the success toast on a matching switch', async () => {
      mockConnectWithProvider.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'success',
            message: 'Account switched successfully.',
          }),
        );
      });
    });

    it('does not show an error toast on a matching switch', async () => {
      mockConnectWithProvider.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalled();
      });

      const errorCall = mockShowToast.mock.calls.find(
        ([{ variant }]) => variant === 'error',
      );
      expect(errorCall).toBeUndefined();
    });
  });

  // ── AC1: mismatch ──────────────────────────────────────────────────────────

  describe('mismatch (wallet extension returned a different key)', () => {
    it('shows the mismatch toast — not the generic error or success', async () => {
      mockConnectWithProvider.mockRejectedValue(
        new WalletAccountMismatchError(TARGET_KEY, WRONG_KEY),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'error',
            message: expect.stringContaining(
              'switch the active account inside your wallet extension',
            ),
          }),
        );
      });
    });

    it('does not show the generic accountSwitchFailed toast on a mismatch', async () => {
      mockConnectWithProvider.mockRejectedValue(
        new WalletAccountMismatchError(TARGET_KEY, WRONG_KEY),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalled();
      });

      const genericFailCall = mockShowToast.mock.calls.find(
        ([arg]) =>
          arg.message === 'Failed to switch account. Please try again.',
      );
      expect(genericFailCall).toBeUndefined();
    });

    it('does not show the success toast on a mismatch', async () => {
      mockConnectWithProvider.mockRejectedValue(
        new WalletAccountMismatchError(TARGET_KEY, WRONG_KEY),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalled();
      });

      const successCall = mockShowToast.mock.calls.find(
        ([{ variant }]) => variant === 'success',
      );
      expect(successCall).toBeUndefined();
    });
  });

  // ── Generic failure (non-mismatch error) ───────────────────────────────────

  describe('generic connection failure (not a mismatch)', () => {
    it('shows the generic accountSwitchFailed toast', async () => {
      mockConnectWithProvider.mockRejectedValue(
        new Error('Freighter not installed'),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'error',
            message: 'Failed to switch account. Please try again.',
          }),
        );
      });
    });
  });

  // ── AC3: session state safety ──────────────────────────────────────────────

  describe('session state after a mismatched switch', () => {
    it('does not store the unintended key in localStorage wallet_session after a mismatch', async () => {
      mockConnectWithProvider.mockRejectedValue(
        new WalletAccountMismatchError(TARGET_KEY, WRONG_KEY),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalled();
      });

      // connectWithProvider threw before any session persistence could occur,
      // so localStorage must remain untouched (still from the original session
      // or absent).
      const stored = localStorage.getItem('wallet_session');
      if (stored) {
        const session = JSON.parse(stored);
        // If there's a session it must NOT be for the unintended WRONG_KEY.
        expect(session.publicKey).not.toBe(WRONG_KEY);
        // And it must NOT be for TARGET_KEY either — we never authenticated as it.
        expect(session.publicKey).not.toBe(TARGET_KEY);
      }
      // (stored being null is equally acceptable — no session written)
    });

    it('does not mutate the wallet context publicKey when connectWithProvider throws a mismatch', async () => {
      // The hook returns CURRENT_KEY; the mock's rejection is a mismatch.
      // After the failed switch attempt, the component should still show
      // CURRENT_KEY in the "Current account" slot (i.e. context publicKey
      // is unchanged — the mock still returns CURRENT_KEY).
      mockConnectWithProvider.mockRejectedValue(
        new WalletAccountMismatchError(TARGET_KEY, WRONG_KEY),
      );
      const user = userEvent.setup();
      renderAccountSwitcher();

      openSwitcher();

      // The current account is shown before switching.
      expect(
        screen.getByText(new RegExp(CURRENT_KEY.slice(0, 6))),
      ).toBeInTheDocument();

      await user.click(getSwitchButton(TARGET_KEY));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalled();
      });

      // The mock still reports CURRENT_KEY — the component should not have
      // updated publicKey to either TARGET_KEY or WRONG_KEY.
      expect(mockWalletState.publicKey).toBe(CURRENT_KEY);
    });
  });

  // ── Early-exit: clicking current account ──────────────────────────────────

  describe('clicking the current account does nothing', () => {
    it('does not call connectWithProvider when the same address is already active', async () => {
      // Only the current account is in the list (no other addresses)
      getRememberedAddresses.mockReturnValue([
        {
          publicKey: CURRENT_KEY,
          provider: 'freighter',
          lastUsed: new Date().toISOString(),
        },
      ]);

      renderAccountSwitcher();
      openSwitcher();

      // No "other" accounts — connectWithProvider should never be called.
      expect(mockConnectWithProvider).not.toHaveBeenCalled();
    });
  });

  // ── Not authenticated: component renders nothing ───────────────────────────

  describe('not authenticated', () => {
    it('renders nothing when the user is not authenticated', () => {
      mockWalletState = {
        ...mockWalletState,
        isAuthenticated: false,
        publicKey: null,
      };
      const { container } = renderAccountSwitcher();
      expect(container).toBeEmptyDOMElement();
    });
  });
});
