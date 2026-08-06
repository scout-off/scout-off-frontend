'use client';
import { Suspense, lazy, type ComponentType } from 'react';
import Spinner from '@/components/ui/Spinner';

/**
 * Defers mounting a heavy dashboard tree (large component tree, eager data
 * fetching) until after first paint, so it no longer blocks the main thread
 * during initial load. Wrap ScoutDashboardContent / PlayerDashboardContent
 * with this instead of importing them directly.
 */
export function createLazyDashboard<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) {
  const LazyComponent = lazy(loader) as unknown as ComponentType<P>;

  return function LazyDashboardBoundary(props: P) {
    return (
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-16">
            <Spinner />
          </div>
        }
      >
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
