const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    // Network-first for API / RPC calls
    {
      urlPattern:
        /^https:\/\/(soroban-testnet|horizon-testnet|soroban)\.stellar\.org\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'stellar-rpc-cache',
        expiration: { maxEntries: 32, maxAgeSeconds: 60 },
      },
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: { maxEntries: 64, maxAgeSeconds: 60 },
      },
    },
    // Cache-first for static assets
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-js-css',
        expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  images: {
    domains: ['ipfs.io', 'gateway.pinata.cloud'],
  },
  webpack(config, { isServer }) {
    // @sentry/nextjs is an optional peer dep used only in production.
    // Mark it as external so webpack doesn't try to bundle it when the
    // package isn't installed locally (e.g. CI / contributor machines).
    config.externals = [
      ...(Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : []),
      ({ request }, callback) => {
        if (request === '@sentry/nextjs')
          return callback(null, 'commonjs @sentry/nextjs');
        callback();
      },
    ];
    return config;
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // Get environment variables with defaults for development
    const ipfsGateway =
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
      'https://gateway.pinata.cloud/ipfs';
    const sorobanRpc =
      process.env.NEXT_PUBLIC_SOROBAN_RPC ||
      'https://soroban-testnet.stellar.org';
    const horizonUrl =
      process.env.NEXT_PUBLIC_HORIZON_URL ||
      'https://horizon-testnet.stellar.org';

    // Extract domain from URLs for CSP (remove protocol and path)
    const extractDomain = (url) => {
      try {
        return new URL(url).origin;
      } catch {
        return url;
      }
    };

    const ipfsGatewayDomain = extractDomain(ipfsGateway);
    const sorobanDomain = extractDomain(sorobanRpc);
    const horizonDomain = extractDomain(horizonUrl);

    // Next.js dev tooling (react-refresh/runtime overlays) relies on inline
    // scripts and eval. Keep production CSP strict.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self'";

    // Build Content Security Policy header
    const cspHeader = [
      "default-src 'self'",
      scriptSrc,
      `img-src 'self' ${ipfsGatewayDomain}`,
      `connect-src 'self' ${sorobanDomain} ${horizonDomain}`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'report-uri /api/csp-report',
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(withPWA(nextConfig));
