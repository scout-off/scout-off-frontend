import { renderHook, act } from '@testing-library/react';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

type Listener = () => void;

function createMockWorkbox() {
  const listeners: Record<string, Set<Listener>> = {
    waiting: new Set(),
    controlling: new Set(),
  };

  return {
    addEventListener: jest.fn((type: string, listener: Listener) => {
      listeners[type].add(listener);
    }),
    removeEventListener: jest.fn((type: string, listener: Listener) => {
      listeners[type].delete(listener);
    }),
    messageSkipWaiting: jest.fn(),
    emit(type: 'waiting' | 'controlling') {
      listeners[type].forEach((listener) => listener());
    },
  };
}

describe('useServiceWorkerUpdate', () => {
  const originalReload = window.location.reload;

  beforeEach(() => {
    delete (window as any).workbox;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: jest.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: originalReload },
      writable: true,
    });
  });

  it('stays false when window.workbox is not present', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());
    expect(result.current.updateAvailable).toBe(false);
  });

  it('sets updateAvailable when workbox emits a waiting event', () => {
    const workbox = createMockWorkbox();
    (window as any).workbox = workbox;

    const { result } = renderHook(() => useServiceWorkerUpdate());
    expect(result.current.updateAvailable).toBe(false);

    act(() => {
      workbox.emit('waiting');
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('dismiss hides the prompt without messaging the service worker', () => {
    const workbox = createMockWorkbox();
    (window as any).workbox = workbox;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    act(() => {
      workbox.emit('waiting');
    });
    expect(result.current.updateAvailable).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(workbox.messageSkipWaiting).not.toHaveBeenCalled();
  });

  it('reload sends SKIP_WAITING and reloads the page once controlling fires', () => {
    const workbox = createMockWorkbox();
    (window as any).workbox = workbox;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    act(() => {
      result.current.reload();
    });
    expect(workbox.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();

    act(() => {
      workbox.emit('controlling');
    });
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on a controlling event unless reload() was called first', () => {
    const workbox = createMockWorkbox();
    (window as any).workbox = workbox;

    renderHook(() => useServiceWorkerUpdate());

    act(() => {
      workbox.emit('controlling');
    });

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('removes listeners on unmount', () => {
    const workbox = createMockWorkbox();
    (window as any).workbox = workbox;

    const { unmount } = renderHook(() => useServiceWorkerUpdate());
    unmount();

    expect(workbox.removeEventListener).toHaveBeenCalledWith(
      'waiting',
      expect.any(Function),
    );
    expect(workbox.removeEventListener).toHaveBeenCalledWith(
      'controlling',
      expect.any(Function),
    );
  });
});
