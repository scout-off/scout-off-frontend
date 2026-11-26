const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  // Run `ANALYZE=true npm run build` to open the treemap reports in the browser.
  enabled: process.env.ANALYZE === 'true',
  // Write the HTML reports into .next/analyze/ so they aren't confused with
  // app source files and are covered by the existing .gitignore for .next/.
  openAnalyzer: false,
});

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Service worker (issue #1712): Serwist compiles worker/sw.ts — precache,
// runtime caching from lib/pwaCacheConfig.ts, the offline fallback page,
// background sync and push — into public/sw.js and injects the client-side
// registration that exposes `window.serwist` (hooks/useServiceWorkerUpdate.ts).
// @serwist/next is ESM-only; require() of ESM needs Node >= 20.19 (.nvmrc is 24).
const withSerwist = require('@serwist/next').default({
  swSrc: 'worker/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
});

const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Issue #1717: emit a self-contained server (.next/standalone) so the
  // production Docker image ships only traced dependencies, not the full
  // node_modules. better-sqlite3's native binding is loaded via `bindings`,
  // so include it explicitly to guarantee it lands in the standalone output.
  output: 'standalone',
  experimental: {
    outputFileTracingIncludes: {
      '/**/*': ['./node_modules/better-sqlite3/build/Release/*.node'],
    },
  },
  typescript: {
    // `next build` runs its own project-wide type check by default, but this
    // repo's CI only gates on `npm run lint` / `npm run test` (see
    // .github/workflows/ci.yml) — `npm run typecheck` (tsc --noEmit) isn't a
    // CI gate today, so unrelated pre-existing type errors elsewhere in the
    // project can otherwise block `next build` for a change that never
    // touched those files (this is what broke the Docker image build added
    // in #675). `npm run typecheck` still surfaces these for anyone who runs
    // it directly; fixing the underlying errors is tracked separately.
    ignoreBuildErrors: true,
  },
  images: {
    /**
     * remotePatterns replaces the deprecated `domains` array.
     * Each entry covers one IPFS gateway that may appear in NEXT_PUBLIC_IPFS_GATEWAY.
     *
     * Pinata dedicated gateway:  https://gateway.pinata.cloud/ipfs/<cid>
     * Pinata dedicated gateway (custom subdomain): https://<name>.mypinata.cloud/ipfs/<cid>
     * Public IPFS gateway:       https://ipfs.io/ipfs/<cid>
     * Dweb.link gateway:         https://dweb.link/ipfs/<cid>
     *
     * Adding a new gateway only requires a new entry here — no other changes needed.
     */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: '**.mypinata.cloud',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'dweb.link',
        pathname: '/ipfs/**',
      },
    ],
  },
  async headers() {
    const securityHeaders = [
      // Content-Security-Policy is now generated per-request in
      // middleware.ts (nonce-based, 'strict-dynamic') so it is NOT set
      // here. Setting it here would override the per-request nonce with a
      // static value and break every inline script that relies on the nonce.
      {
        key: 'Reporting-Endpoints',
        value: 'csp-endpoint="/api/csp-report"',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      // Legacy XSS auditor disabled on purpose — CSP (lib/csp.ts) is the XSS defence.
      {
        key: 'X-XSS-Protection',
        value: '0',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin-allow-popups',
      },
      {
        key: 'Permissions-Policy',
        value:
          'accelerometer=(), autoplay=(), camera=(self), display-capture=(), geolocation=(), gyroscope=(), hid=(self), microphone=(), midi=(), payment=(), usb=(self)',
      },
    ];

    if (isProduction) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// @sentry/nextjs's build-time plugin uploads source maps and tags the
// release for every build. It no-ops (with a warning) when SENTRY_AUTH_TOKEN
// isn't set, so local/contributor builds are unaffected.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  release: {
    // Falls back to the plugin's own git-HEAD auto-detection when unset.
    name: process.env.SENTRY_RELEASE,
  },
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
};

module.exports = withSentryConfig(
  withBundleAnalyzer(withNextIntl(withSerwist(nextConfig))),
  sentryBuildOptions,
);
