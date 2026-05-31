import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useTheme } from "@/hooks/useTheme";

// Helpers
function setStoredTheme(value: string | null) {
  if (value === null) {
    localStorage.removeItem("theme");
  } else {
    localStorage.setItem("theme", value);
  }
}

function setOsPreference(dark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? dark : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    setOsPreference(false);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to dark when OS preference is dark and no stored value", () => {
    setOsPreference(true);
    const { result } = renderHook(() => useTheme());
    act(() => {}); // flush useEffect
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("defaults to light when OS preference is light and no stored value", () => {
    setOsPreference(false);
    const { result } = renderHook(() => useTheme());
    act(() => {});
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores dark theme from localStorage", () => {
    setStoredTheme("dark");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores light theme from localStorage", () => {
    setStoredTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("localStorage takes precedence over OS preference", () => {
    setOsPreference(true);
    setStoredTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle switches from dark to light", () => {
    setStoredTheme("dark");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    act(() => { result.current.toggle(); });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle switches from light to dark", () => {
    setStoredTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    act(() => { result.current.toggle(); });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists toggled theme to localStorage", () => {
    setStoredTheme("dark");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    act(() => { result.current.toggle(); });
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("persists light→dark toggle to localStorage", () => {
    setStoredTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {});
    act(() => { result.current.toggle(); });
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
