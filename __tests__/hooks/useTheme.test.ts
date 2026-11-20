/**
 * Issue #1069 — hook test coverage suite.
 * Tests for useTheme (hooks/useTheme.ts), the light/dark theme accessor
 * consumed by components/ui/ThemeToggle.tsx and layered on
 * context/ThemeContext.tsx.
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';

import { ThemeProvider, useTheme } from '@/context/ThemeContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, null, children);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useTheme — public return shape', () => {
  it('exposes the current theme and the theme mutators', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current).toEqual(
      expect.objectContaining({
        theme: expect.any(String),
        toggleTheme: expect.any(Function),
        setTheme: expect.any(Function),
      }),
    );
  });
});

describe('useTheme — reading the current theme', () => {
  it('returns the default theme from context', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(['light', 'dark']).toContain(result.current.theme);
  });
});

describe('useTheme — state transitions', () => {
  it('toggleTheme flips the theme value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    const initial = result.current.theme;

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).not.toBe(initial);
  });

  it('setTheme updates the context value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
  });
});

describe('useTheme — outside ThemeContext.Provider', () => {
  it('throws when rendered without a ThemeProvider', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => renderHook(() => useTheme())).toThrow();

    consoleError.mockRestore();
  });
});
