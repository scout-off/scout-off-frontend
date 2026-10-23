'use client';

import { useSyncExternalStore } from 'react';

/** Matches Tailwind's `sm` breakpoint, below which the Navbar collapses. */
const MOBILE_QUERY = '(max-width: 639px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

const getSnapshot = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia(MOBILE_QUERY).matches;

/** The server never knows the viewport, so SSR (and hydration) render the desktop layout. */
const getServerSnapshot = (): boolean => false;

/** True when the viewport is narrower than the `sm` breakpoint. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
