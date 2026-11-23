'use client';
import { Suspense, useEffect, useState } from 'react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ScoutDashboardContent from '@/components/scout/ScoutDashboardContent';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';

// Issue #7: scouts without an active subscription are redirected to
// /scout/subscribe via `useRequireSubscription` (toast +
// ?reason=subscription-expired banner).
//
// Why the `hydrated` flip: this component is rendered server-side as a
// plain pass-through (server has no useState/useEffect state), so it emits
// the children HTML exactly. We mirror that on the client's first render
// via the `hydrated` flag — only after hydration completes do we read the
// subscription state and return either children (if protected) or null
// (if loading or not protected). This avoids a hydration-mismatch
// warning that React would otherwise emit when the first client render
// flips between server-emitted children and a guard-returned null. The
// `useRequireWallet` branch inside ScoutDashboardContent still handles
// the unauthenticated user before this guard ever sees a non-null
// publicKey, so there's no redirect-loop risk.
export default function ScoutDashboard() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { isProtected, loading } = useRequireSubscription();

  // Pre-hydration first render — match the server-emitted children so
  // React's hydration reconciles cleanly. Guard logic kicks in immediately
  // after hydration.
  if (!hydrated) {
    return (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <ScoutDashboardContent />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (loading || !isProtected) return null;

  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ScoutDashboardContent />
      </Suspense>
    </ErrorBoundary>
  );
}
