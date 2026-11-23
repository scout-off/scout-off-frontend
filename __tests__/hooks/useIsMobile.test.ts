import { act, renderHook } from '@testing-library/react';
import { useIsMobile } from '@/hooks/useIsMobile';

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: jest.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: jest.fn((_: string, cb: Listener) =>
      listeners.delete(cb),
    ),
  };
  window.matchMedia = jest.fn(() => mql as unknown as MediaQueryList);
  return {
    mql,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('useIsMobile', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('returns false when matchMedia is unavailable', () => {
    // @ts-expect-error simulate a browser without matchMedia
    delete window.matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true on the first render when the query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const media = mockMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
