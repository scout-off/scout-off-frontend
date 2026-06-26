import { checkRateLimit, _resetStore } from "../../lib/rateLimit";

beforeEach(() => _resetStore());

describe("checkRateLimit — within limit", () => {
  test("allows first request", () => {
    const result = checkRateLimit("test:1.2.3.4", 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  test("allows up to the limit without blocking", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("test:1.2.3.4", 10, 60_000).allowed).toBe(true);
    }
  });

  test("isolates counts per key", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("test:ip-a", 10, 60_000);
    // ip-b is a separate key — should still be allowed
    expect(checkRateLimit("test:ip-b", 10, 60_000).allowed).toBe(true);
  });
});

describe("checkRateLimit — exceeding limit", () => {
  test("blocks the 11th request", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("test:1.2.3.4", 10, 60_000);
    const result = checkRateLimit("test:1.2.3.4", 10, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  test("retryAfter is a positive integer in seconds", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("test:1.2.3.4", 10, 60_000);
    const { retryAfter } = checkRateLimit("test:1.2.3.4", 10, 60_000);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });
});

describe("checkRateLimit — window expiry", () => {
  test("resets count after the window expires", () => {
    jest.useFakeTimers();

    for (let i = 0; i < 10; i++) checkRateLimit("test:1.2.3.4", 10, 60_000);
    expect(checkRateLimit("test:1.2.3.4", 10, 60_000).allowed).toBe(false);

    jest.advanceTimersByTime(60_001);

    expect(checkRateLimit("test:1.2.3.4", 10, 60_000).allowed).toBe(true);

    jest.useRealTimers();
  });
});
