/**
 * Unit tests for hooks/useDebounce
 * Issue #94 – perf: debounce filter inputs in scout dashboard
 */
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

// Use fake timers so we can control setTimeout
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update the debounced value before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 300 } }
    );

    rerender({ value: "updated", delay: 300 });

    // Advance time by less than the delay
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe("initial");
  });

  it("updates the debounced value after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 300 } }
    );

    rerender({ value: "updated", delay: 300 });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe("updated");
  });

  it("resets the timer on rapid successive changes (only last value wins)", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 300 } }
    );

    // Rapid successive changes
    rerender({ value: "b", delay: 300 });
    act(() => { jest.advanceTimersByTime(100); });

    rerender({ value: "c", delay: 300 });
    act(() => { jest.advanceTimersByTime(100); });

    rerender({ value: "d", delay: 300 });
    act(() => { jest.advanceTimersByTime(100); });

    // Still on original value — 300 ms hasn't elapsed since last change
    expect(result.current).toBe("a");

    // Now let the full delay pass after the last change
    act(() => { jest.advanceTimersByTime(300); });

    expect(result.current).toBe("d");
  });

  it("works with number values (generic type)", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 300 } }
    );

    rerender({ value: 42, delay: 300 });

    act(() => { jest.advanceTimersByTime(300); });

    expect(result.current).toBe(42);
  });

  it("works with object values (generic type)", () => {
    const initial = { region: "Africa", position: "ST" };
    const updated = { region: "Europe", position: "GK" };

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initial, delay: 300 } }
    );

    rerender({ value: updated, delay: 300 });

    act(() => { jest.advanceTimersByTime(300); });

    expect(result.current).toEqual(updated);
  });

  it("respects a custom delay value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "start", delay: 500 } }
    );

    rerender({ value: "end", delay: 500 });

    // 300 ms is not enough for a 500 ms delay
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe("start");

    // 500 ms total is enough
    act(() => { jest.advanceTimersByTime(200); });
    expect(result.current).toBe("end");
  });
});
