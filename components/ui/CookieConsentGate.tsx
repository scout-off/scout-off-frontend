'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import CookieConsentBanner, { hasConsent } from './CookieConsentBanner';

// Dynamically import analytics and web vitals — these modules should only
// be loaded after the user has accepted cookies.  Using next/dynamic with
// ssr: false ensures the modules (which touch window / PerformanceObserver)
// only load client-side.
const Analytics = dynamic(
  () => import('@vercel/analytics/next').then((m) => m.Analytics),
  { ssr: false },
);

const WebVitalsReporter = dynamic(
  () => import('@/components/WebVitalsReporter'),
  { ssr: false },
);

/**
 * CookieConsentGate
 *
 * Renders the cookie consent banner on first visit and only mounts
 * analytics / error-reporting scripts once the user has accepted.
 *
 * Design decisions (per team discussion):
 * - Vercel Analytics (usage tracking) requires explicit consent.
 * - Web Vitals reporting is gated alongside analytics (it feeds the same
 *   Vercel Analytics pipeline).
 * - Sentry is initialised unconditionally in sentry.client.config.ts
 *   (it's imported as a side-effect at module level, not via a React
 *   component), so we don't gate it here — error reporting is considered
 *   an essential/operational function, not marketing tracking.
 */
export default function CookieConsentGate() {
  const [consented, setConsented] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Check stored consent on mount
    setConsented(hasConsent());
    setMounted(true);
  }, []);

  const handleConsentChange = (accepted: boolean) => {
    setConsented(accepted);
    // When the user accepts, the page doesn't need a full reload — the
    // dynamic imports above will mount on the next render.
  };

  // Don't render anything until we've checked localStorage (avoids flash
  // of the consent banner on users who've already accepted).
  if (!mounted) return null;

  return (
    <>
      <CookieConsentBanner onConsentChange={handleConsentChange} />
      {consented && (
        <>
          <Analytics />
          <WebVitalsReporter />
        </>
      )}
    </>
  );
}
