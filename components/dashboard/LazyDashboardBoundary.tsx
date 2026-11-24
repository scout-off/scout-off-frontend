'use client';
import { Suspense, lazy, type ComponentType } from 'react';
import Spinner from '@/components/ui/Spinner';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

/**
 * Defers mounting a heavy dashboard tree (large component tree, eager data
 * fetching) until after first paint, so it no longer blocks the main thread
 * during initial load. Wrap ScoutDashboardContent / PlayerDashboardContent
 * with this instead of importing them directly. Render errors show a
 * retryable fallback instead of crashing the page.
 */
export function createLazyDashboard<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) {
  const LazyComponent = lazy(loader) as unknown as ComponentType<P>;

  return function LazyDashboardBoundary(props: P) {
    return (
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex justify-center items-center py-16">
              <Spinner />
            </div>
          }
        >
          <LazyComponent {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}
