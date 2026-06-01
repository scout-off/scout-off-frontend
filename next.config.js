/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    // Network-first for API / RPC calls
    {
      urlPattern: /^https:\/\/(soroban-testnet|horizon-testnet|soroban)\.stellar\.org\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "stellar-rpc-cache",
        expiration: { maxEntries: 32, maxAgeSeconds: 60 },
      },
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 },
      },
    },
    // Cache-first for static assets
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-js-css",
        expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  images: {
    domains: ['ipfs.io', 'gateway.pinata.cloud'],
  },
};

module.exports = withPWA(nextConfig);
