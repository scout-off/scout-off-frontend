import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// lib/api.ts builds its axios instance once, at module load, via
// `axios.create(...)` — generateReferralCode / getReferralStats /
// listReferralCodes close over that instance internally, so mocking
// '@/lib/api' itself can't intercept their HTTP calls (their real
// implementations are bound to the real instance, not whatever a mock
// later exposes as the default export). Mocking 'axios' one level down
// lets lib/api.ts load for real while still controlling every call it
// makes through api.get/api.post. The get/post jest.fn()s are created
// inside the factory (not referenced from outer scope) since jest hoists
// this call above the test file's own top-level `const` declarations.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ get: jest.fn(), post: jest.fn() })),
  },
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));

// scoutId is passed explicitly in every test below to represent the scout
// viewing (and acting on) their own referral panel, so the connected
// wallet matches scoutId — mirroring how the page actually renders this
// component for its primary use case.
const SCOUT_ID = 'scout-abc-123';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(() => ({ publicKey: 'scout-abc-123' })),
}));

// ── Typed imports (after mocks) ───────────────────────────────────────────────

import axios from 'axios';
import ReferralPanel, {
  type ReferralStats,
  type ReferralCode,
} from '@/components/scout/ReferralPanel';
import { useToast } from '@/components/ui/Toast';

// lib/api.ts already called axios.create() once, during the import chain
// above — grab the (get/post) instance that call returned so tests can
// control it.
const mockAxiosInstance = (axios.create as jest.Mock).mock.results[0].value;
const mockApiGet = mockAxiosInstance.get as jest.Mock;
const mockApiPost = mockAxiosInstance.post as jest.Mock;
const mockUseToast = useToast as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStats(overrides: Partial<ReferralStats> = {}): ReferralStats {
  return {
    totalCodes: 5,
    successfulReferrals: 3,
    ...overrides,
  };
}

function makeCode(code: string): ReferralCode {
  return {
    code,
    scoutWallet: SCOUT_ID,
    createdAt: Date.now() / 1000,
    usedBy: null,
    usedAt: null,
  };
}

function makeToast() {
  const show = jest.fn();
  mockUseToast.mockReturnValue({ show });
  return { show };
}

// getReferralStats and listReferralCodes are two separate GET endpoints
// (/referrals/count/:wallet and /referrals/scout/:wallet respectively) —
// route mockApiGet by URL so each can be controlled independently. Left
// unresolved by default (stats) / resolved empty by default (codes) so
// tests that only care about one don't need to set up the other.
let statsResponse: () => Promise<{ data: ReferralStats }> = () =>
  new Promise(() => {});
let codesResponse: () => Promise<{ data: ReferralCode[] }> = () =>
  Promise.resolve({ data: [] });

beforeEach(() => {
  jest.clearAllMocks();
  statsResponse = () => new Promise(() => {});
  codesResponse = () => Promise.resolve({ data: [] });
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/referrals/count/')) return statsResponse();
    if (url.includes('/referrals/scout/')) return codesResponse();
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

/** Setup getReferralStats to resolve with the given stats. */
function resolveStats(stats: ReferralStats) {
  statsResponse = () => Promise.resolve({ data: stats });
}

/** Setup getReferralStats to reject. */
function rejectStats(err = new Error('Network Error')) {
  statsResponse = () => Promise.reject(err);
}

/** Setup listReferralCodes to resolve with the given codes. */
function resolveCodes(codes: ReferralCode[]) {
  codesResponse = () => Promise.resolve({ data: codes });
}

/** Setup api.post (generateReferralCode) to resolve with a new code. */
function resolveGenerate(code: ReferralCode) {
  mockApiPost.mockResolvedValue({ data: code });
}

/** Setup api.post (generateReferralCode) to reject. */
function rejectGenerate(err = new Error('Server Error')) {
  mockApiPost.mockRejectedValue(err);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReferralPanel — initial loading state', () => {
  beforeEach(() => {
    makeToast();
  });

  it('shows a loading indicator while stats are being fetched', () => {
    // statsResponse defaults to a never-resolving promise (see beforeEach).
    render(<ReferralPanel scoutId={SCOUT_ID} />);
    expect(screen.getByLabelText('Loading stats')).toBeInTheDocument();
  });

  it('keeps the Generate button enabled while stats are still loading', () => {
    // Generate only depends on the connected wallet, not on the stats
    // fetch — it should never be gated by loading.
    render(<ReferralPanel scoutId={SCOUT_ID} />);
    expect(
      screen.getByRole('button', { name: /generate invite link/i }),
    ).not.toBeDisabled();
  });

  it('renders stats and codes after a successful load', async () => {
    resolveStats(makeStats());
    resolveCodes([makeCode('CODE-001'), makeCode('CODE-002')]);
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(screen.getByText('3 referrals')).toBeInTheDocument();
    });
    expect(screen.getByText(/CODE-001/)).toBeInTheDocument();
    expect(screen.getByText(/CODE-002/)).toBeInTheDocument();
  });

  it('shows the empty-state message when the codes list is empty', async () => {
    resolveStats(makeStats());
    resolveCodes([]);
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText(/your generated invite links will appear here/i),
      ).toBeInTheDocument();
    });
  });
});

// ── Error state on initial load ───────────────────────────────────────────────

describe('ReferralPanel — API failure on load', () => {
  it('shows an error toast when getReferralStats rejects', async () => {
    const { show } = makeToast();
    rejectStats();
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('error toast message mentions referral stats', async () => {
    const { show } = makeToast();
    rejectStats(new Error('500'));
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/referral stats/i),
          variant: 'error',
        }),
      );
    });
  });
});

// ── Generate invite link ──────────────────────────────────────────────────────

describe('ReferralPanel — generate invite link', () => {
  beforeEach(() => {
    makeToast();
    resolveStats(makeStats());
    resolveCodes([]);
  });

  it('adds the new code to the list after successful generation', async () => {
    resolveGenerate(makeCode('CODE-NEW'));

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/CODE-NEW/)).toBeInTheDocument();
    });
  });

  it('calls generateReferralCode with the connected wallet', async () => {
    resolveGenerate(makeCode('CODE-NEW'));

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    expect(mockApiPost).toHaveBeenCalledWith('/referrals/generate', {
      scoutWallet: SCOUT_ID,
      turnstileToken: undefined,
    });
  });

  it('disables the Generate button while generation is in-flight', async () => {
    // Promise that never resolves keeps the component generating
    mockApiPost.mockReturnValue(new Promise(() => {}));

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    const btn = screen.getByRole('button', { name: /generate invite link/i });

    act(() => {
      fireEvent.click(btn);
    });

    // The button's accessible name changes to "Generating…" once clicked
    // (see the ternary in the component), so re-query it by its stable
    // container/DOM node reference rather than its (now-different) name.
    await waitFor(() => {
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent(/generating/i);
    });
  });

  it('shows an error toast when generateReferralCode rejects', async () => {
    const { show } = makeToast();
    rejectGenerate();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/failed to generate an invite link/i),
        variant: 'error',
      }),
    );
  });
});

// ── Copy to clipboard ─────────────────────────────────────────────────────────

describe('ReferralPanel — copy to clipboard', () => {
  beforeEach(() => {
    makeToast();
    resolveStats(makeStats());
    resolveCodes([makeCode('CODE-001'), makeCode('CODE-002')]);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function mockClipboardSuccess() {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    return { writeText };
  }

  function mockClipboardFailure() {
    const writeText = jest.fn().mockRejectedValue(new Error('ClipboardError'));
    Object.assign(navigator, { clipboard: { writeText } });
    return { writeText };
  }

  it('shows "Copied!" confirmation after clicking a copy button', async () => {
    mockClipboardSuccess();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText(/CODE-001/)).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /code-001/i }));
    });

    expect(screen.getByRole('button', { name: /code-001/i })).toHaveTextContent(
      'Copied!',
    );
  });

  it('"Copied!" label clears after ~2 seconds', async () => {
    mockClipboardSuccess();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText(/CODE-001/)).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /code-001/i }));
    });

    expect(screen.getByRole('button', { name: /code-001/i })).toHaveTextContent(
      'Copied!',
    );

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(screen.getByRole('button', { name: /code-001/i })).toHaveTextContent(
      'Copy',
    );
  });

  it('only shows "Copied!" on the clicked code, not others', async () => {
    mockClipboardSuccess();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText(/CODE-001/)).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /code-001/i }));
    });

    expect(screen.getByRole('button', { name: /code-001/i })).toHaveTextContent(
      'Copied!',
    );

    // The second code's button should still say "Copy"
    expect(screen.getByRole('button', { name: /code-002/i })).toHaveTextContent(
      'Copy',
    );
  });

  it('leaves the button showing "Copy" (not "Copied!") when the clipboard API fails', async () => {
    mockClipboardFailure();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText(/CODE-001/)).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /code-001/i }));
    });

    // A failed clipboard write silently fails (matches TruncatedAddress's
    // convention) rather than showing a misleading "Copied!" state.
    expect(screen.getByRole('button', { name: /code-001/i })).toHaveTextContent(
      'Copy',
    );
  });
});
