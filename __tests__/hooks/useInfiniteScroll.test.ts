/**
 * Issue #1065 — unit test coverage for useInfiniteScroll (hooks/useInfiniteScroll.ts).
 * Follows the same renderHook + module-boundary mocking conventions used by
 * sibling hook specs under __tests__/hooks/.
 */
import { renderHook, act } from '@testing-library/react';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
const observeMock = jest.fn();
const disconnectMock = jest.fn();
const unobserveMock = jest.fn();

class MockIntersectionObserver {
  constructor(cb: ObserverCallback) {
    observerCallback = cb;
  }
  observe = observeMock;
  unobserve = unobserveMock;
  disconnect = disconnectMock;
  takeRecords = jest.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}

beforeEach(() => {
  jest.resetAllMocks();
  observerCallback = null;
  (
    global as unknown as { IntersectionObserver: unknown }
  ).IntersectionObserver = MockIntersectionObserver;
});

describe('useInfiniteScroll — public return shape', () => {
  it('exposes the expected fields', () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, onLoadMore: jest.fn() }),
    );

    expect(result.current).toEqual(
      expect.objectContaining({
        sentinelRef: expect.anything(),
      }),
    );
  });
});

describe('useInfiniteScroll — sentinel visible advances page', () => {
  it('calls onLoadMore when the sentinel becomes visible', () => {
    const onLoadMore = jest.fn();
    renderHook(() => useInfiniteScroll({ hasMore: true, onLoadMore }));

    expect(observerCallback).not.toBeNull();

    act(() => {
      observerCallback!([{ isIntersecting: true }]);
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe('useInfiniteScroll — no advancement once hasMore is false', () => {
  it('does not call onLoadMore when hasMore is false', () => {
    const onLoadMore = jest.fn();
    renderHook(() => useInfiniteScroll({ hasMore: false, onLoadMore }));

    if (observerCallback) {
      act(() => {
        observerCallback!([{ isIntersecting: true }]);
      });
    }

    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

describe('useInfiniteScroll — cleanup', () => {
  it('disconnects the IntersectionObserver on unmount', () => {
    const { unmount } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, onLoadMore: jest.fn() }),
    );

    unmount();

    expect(disconnectMock).toHaveBeenCalled();
  });
});
