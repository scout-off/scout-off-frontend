import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OfflineBanner from '@/components/OfflineBanner';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      bannerMessage: "You're offline. Some features may not work.",
    };
    return messages[key] ?? key;
  },
}));

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

function mockFetchOnce(impl: () => Promise<{ ok: boolean; status: number }>) {
  (global.fetch as jest.Mock).mockImplementation(impl);
}

describe('OfflineBanner', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    setOnLine(true);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    jest.useRealTimers();
    setOnLine(originalOnLine);
    jest.restoreAllMocks();
  });

  it('renders nothing while online and connectivity check succeeds', async () => {
    render(<OfflineBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the banner immediately when navigator.onLine is false, without waiting on fetch', async () => {
    setOnLine(false);

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getByText("You're offline. Some features may not work."),
    ).toBeInTheDocument();
    // The offline branch returns early — checkConnectivity's fetch is skipped.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the banner when online but the connectivity fetch throws', async () => {
    mockFetchOnce(() => Promise.reject(new Error('network down')));

    render(<OfflineBanner />);

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('treats a 401 response as connected (authenticated check unrelated to connectivity)', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 401 }));

    render(<OfflineBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('treats a non-401 non-ok response as offline', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 500 }));

    render(<OfflineBanner />);

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows the banner when a native "offline" event fires', async () => {
    render(<OfflineBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    setOnLine(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hides the banner again when a native "online" event fires and connectivity is restored', async () => {
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    setOnLine(true);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
  });

  it('re-checks connectivity every 30 seconds', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    render(<OfflineBanner />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('removes event listeners and clears the interval on unmount', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { unmount } = render(<OfflineBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    unmount();

    const addedEvents = addSpy.mock.calls.map((c) => c[0]);
    expect(addedEvents).toEqual(expect.arrayContaining(['online', 'offline']));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
