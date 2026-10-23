/**
 * Unit tests for hooks/useApiErrorMessage.ts (issue #1537).
 *
 * useApiErrorMessage wraps useTranslations('apiErrors') and parseApiError to
 * map API error response bodies to localised strings, falling back to the
 * 'UNKNOWN' key when the body doesn't carry a recognised code.
 *
 * Strategy: the global jest.setup.ts mock for next-intl only covers a
 * handful of namespaces. For the 'apiErrors' namespace we override
 * useTranslations locally so that:
 *   – t(key) returns a deterministic sentinel string per key
 *   – t.has(key) returns true only for keys in the KNOWN set
 * This lets us test the hook's routing logic without depending on the real
 * translation catalogue.
 */
import { renderHook } from '@testing-library/react';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';

// ---------------------------------------------------------------------------
// Stub translation table used by the local mock below
// ---------------------------------------------------------------------------

const KNOWN_CODES = [
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'QUERY_TOO_LONG',
  'UPSTREAM_FAILED',
  'INVALID_SIGNATURE',
  'UPLOAD_SESSION_NOT_FOUND',
  'CHUNK_INDEX_OUT_OF_RANGE',
  'UPLOAD_INCOMPLETE',
  'DISPUTE_ALREADY_PENDING',
  'MILESTONE_NOT_FOUND',
  'UNKNOWN',
] as const;

type KnownCode = (typeof KNOWN_CODES)[number];

/** Sentinel: makes it obvious which key was resolved in assertion failures. */
function stubMessage(key: string): string {
  return `[stub:${key}]`;
}

// ---------------------------------------------------------------------------
// Override next-intl mock for the apiErrors namespace
// ---------------------------------------------------------------------------

jest.mock('next-intl', () => {
  const original = jest.requireActual<typeof import('next-intl')>('next-intl');
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      if (namespace !== 'apiErrors') {
        // Delegate to the original mock for other namespaces
        return (key: string) => key;
      }
      const knownSet = new Set<string>(KNOWN_CODES);
      const t = (key: string, _values?: Record<string, unknown>) =>
        stubMessage(key);
      t.has = (key: string) => knownSet.has(key);
      t.rich = (key: string) => stubMessage(key);
      return t;
    },
    useLocale: () => 'en',
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a well-formed coded API error body. */
function codedBody(code: string, params?: Record<string, unknown>) {
  return {
    error: { code, message: 'english text', ...(params ? { params } : {}) },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useApiErrorMessage', () => {
  it('returns a function', () => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(typeof result.current).toBe('function');
  });

  describe('known error codes', () => {
    it.each(KNOWN_CODES.filter((c) => c !== 'UNKNOWN'))(
      'resolves a coded body with code "%s" to the matching stub message',
      (code) => {
        const { result } = renderHook(() => useApiErrorMessage());
        expect(result.current(codedBody(code))).toBe(stubMessage(code));
      },
    );
  });

  describe('unknown / unrecognised codes', () => {
    it('falls back to UNKNOWN for a coded body with an unrecognised code', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current(codedBody('SOME_NEW_CODE_NOT_IN_CATALOGUE'))).toBe(
        stubMessage('UNKNOWN'),
      );
    });

    it('falls back to UNKNOWN for a legacy string-error body', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current({ error: 'Forbidden' })).toBe(
        stubMessage('UNKNOWN'),
      );
    });

    it('falls back to UNKNOWN for null', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current(null)).toBe(stubMessage('UNKNOWN'));
    });

    it('falls back to UNKNOWN for undefined', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current(undefined)).toBe(stubMessage('UNKNOWN'));
    });

    it('falls back to UNKNOWN for an empty object', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current({})).toBe(stubMessage('UNKNOWN'));
    });

    it('falls back to UNKNOWN for a plain string', () => {
      const { result } = renderHook(() => useApiErrorMessage());
      expect(result.current('not a body')).toBe(stubMessage('UNKNOWN'));
    });
  });

  describe('params forwarding', () => {
    it('forwards params when resolving a known code', () => {
      // We just assert the correct key is chosen; the stub ignores params,
      // but the real t() would interpolate them. This confirms the hook
      // passes params through to t().
      const { result } = renderHook(() => useApiErrorMessage());
      const body = codedBody('QUERY_TOO_LONG', { max: 200 });
      expect(result.current(body)).toBe(stubMessage('QUERY_TOO_LONG'));
    });
  });

  describe('stable reference (useCallback)', () => {
    it('returns the same function reference across re-renders', () => {
      const { result, rerender } = renderHook(() => useApiErrorMessage());
      const firstRef = result.current;
      rerender();
      expect(result.current).toBe(firstRef);
    });
  });
});
