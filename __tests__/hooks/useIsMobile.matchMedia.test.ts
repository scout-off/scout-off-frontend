import { act, renderHook } from '@testing-library/react';
import { useIsMobile } from '@/hooks/useIsMobile';

type Listener = (e: { matches: boolean }) => void;

function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const addEventListener = jest.fn((_type: string, cb: Listener) => {
    listeners.add(cb);
  });
  const removeEventListener = jest.fn((_type: string, cb: Listener) => {
    listeners.delete(cb);
  });
  const matchMedia = jest.fn((query: string) => ({
    matches: initial,
    media: query,
    addEventListener,
    removeEventListener,
  }));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  const emit = (matches: boolean) => listeners.forEach((l) => l({ matches }));
  return { matchMedia, addEventListener, removeEventListener, emit, listeners };
}

describe('useIsMobile', () => {
  const original = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: original,
    });
  });

  it('returns false and does not throw when matchMedia is absent', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true after mount when the media query matches', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('queries exactly (max-width: 639px)', () => {
    const { matchMedia } = installMatchMedia(false);
    renderHook(() => useIsMobile());
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 639px)');
  });

  it('toggles when a change event is dispatched', () => {
    const { emit, addEventListener } = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    act(() => emit(true));
    expect(result.current).toBe(true);
    act(() => emit(false));
    expect(result.current).toBe(false);
  });

  it('removes the change listener on unmount', () => {
    const { removeEventListener, listeners } = installMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.size).toBe(1);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(listeners.size).toBe(0);
  });
});
