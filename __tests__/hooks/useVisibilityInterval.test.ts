import { renderHook, act } from '@testing-library/react';
import { useVisibilityInterval } from '@/hooks/useVisibilityInterval';

describe('useVisibilityInterval', () => {
  const setVisibilityState = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value,
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    setVisibilityState('visible');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('stops firing while the document is hidden', () => {
    const callback = jest.fn();

    renderHook(() => useVisibilityInterval(callback, 1000));

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('runs immediately when the tab becomes visible with runOnVisible', () => {
    const callback = jest.fn();

    renderHook(() =>
      useVisibilityInterval(callback, 1000, { runOnVisible: true }),
    );

    expect(callback).toHaveBeenCalledTimes(1);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
