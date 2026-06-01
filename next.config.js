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
  async headers() {
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

    // Build Content Security Policy header
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self'",
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

module.exports = withPWA(nextConfig);
