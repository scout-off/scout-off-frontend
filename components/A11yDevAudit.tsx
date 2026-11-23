'use client';

import { useEffect } from 'react';

/**
 * Wires up @axe-core/react so accessibility violations (e.g. icon-only
 * buttons with no accessible name) surface as console warnings during local
 * development. Dev-only and a no-op in production/test builds.
 */
export default function A11yDevAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    Promise.all([
      import('@axe-core/react'),
      import('react'),
      import('react-dom'),
    ]).then(([axe, React, ReactDOM]) => {
      axe.default(React, ReactDOM, 1000);
    });
  }, []);

  return null;
}
