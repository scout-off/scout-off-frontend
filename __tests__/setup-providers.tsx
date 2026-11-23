/**
 * Shared render helper for tests that mount App Router pages and dashboard
 * components. Without these providers, anything that calls useToast(),
 * useWallet(), useWalletContext(), or chained hooks like useRequireWallet /
 * useRequireSubscription will throw a "must be used inside X provider"
 * error when the test renders the production component tree without first
 * wrapping it.
 *
 * Usage:
 *
 *   // Before
 *   import { render, screen } from '@testing-library/react';
 *
 *   // After
 *   import { render, screen } from '@/__tests__/setup-providers';
 *
 * The helper re-exports everything from @testing-library/react except
 * `render`, which is replaced by `renderWithProviders` below. Tests can
 * keep `jest.mock('@/hooks/useWallet')`-style mocks at the module level
 * — those override the provider's implementation transparently because
 * Jest mocks apply before any React context resolves.
 *
 * Notes:
 *
 *   • SWR is wrapped in <SWRConfig value={{ provider: () => new Map() }}>
 *     so subscription / fetcher state does not bleed across tests.
 *   • localStorage.clear() runs in jest.setup.ts's beforeEach, so
 *     WalletProvider's session-restore effect does not trip on a stale
 *     session from a previous test in the same file.
 *   • This file is excluded from jest's testMatch via
 *     testPathIgnorePatterns in jest.config.js — it has no describe /
 *     test blocks and would otherwise be reported as "no tests found".
 */
import React, { type ReactElement, type ReactNode } from 'react';
import {
  render as rtlRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ToastProvider } from '@/components/ui/Toast';
import { WalletProvider } from '@/context/WalletContext';

export interface ProvidersProps {
  children: ReactNode;
}

/** Wrapper component composing SWRConfig + ToastProvider + WalletProvider. */
export function Providers({ children }: ProvidersProps) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <ToastProvider>
        <WalletProvider>{children}</WalletProvider>
      </ToastProvider>
    </SWRConfig>
  );
}

/**
 * Drop-in replacement for @testing-library/react's `render` that
 * pre-wraps the UI in the providers needed by App Router pages and
 * dashboard components during tests.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

// Re-export the rest of @testing-library/react for ergonomics. The wildcard
// export * brings in screen, fireEvent, act, waitFor, etc. We override
// `render` below with the wrapped version so a single import line in test
// files suffices.
export * from '@testing-library/react';
export { renderWithProviders as render };
