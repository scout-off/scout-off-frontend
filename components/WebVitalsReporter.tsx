'use client';

import { useEffect } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { onCLS, onINP, onLCP, onTTFB } from 'web-vitals';
import { reportWebVital } from '@/lib/webVitals';

/**
 * Reports real-user Core Web Vitals (LCP, CLS, INP, TTFB) to the analytics
 * pipeline. Mounted once in the root layout — Next.js layouts persist
 * across client-side route transitions, so this registers each web-vitals
 * observer exactly once per hard navigation, matching how the underlying
 * metrics are actually measured (they describe the loaded document, not
 * individual SPA route changes).
 */
export default function WebVitalsReporter() {
  const pathname = usePathname();
  const params = useParams<Record<string, string | string[]>>();

  useEffect(() => {
    onLCP((metric) => reportWebVital(metric, pathname, params));
    onCLS((metric) => reportWebVital(metric, pathname, params));
    onINP((metric) => reportWebVital(metric, pathname, params));
    onTTFB((metric) => reportWebVital(metric, pathname, params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
