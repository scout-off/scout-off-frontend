/**
 * @jest-environment node
 *
 * Guards the static security headers set in next.config.js#headers() (#1588).
 * The plugin wrappers are stubbed as identity functions so the raw config's
 * headers() can be called without loading Sentry, PWA or next-intl.
 */
jest.mock('next-intl/plugin', () => () => (config: unknown) => config);
jest.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: unknown) => config,
}));
jest.mock('@next/bundle-analyzer', () => () => (config: unknown) => config);
jest.mock('next-pwa', () => () => (config: unknown) => config);

type Header = { key: string; value: string };

async function getHeaders(): Promise<Header[]> {
  const nextConfig = require('../../next.config.js');
  const routes: { source: string; headers: Header[] }[] =
    await nextConfig.headers();
  return routes.find((r) => r.source === '/:path*')?.headers ?? [];
}

describe('next.config.js security headers', () => {
  it('disables the legacy XSS auditor with X-XSS-Protection: 0', async () => {
    const headers = await getHeaders();
    expect(headers).toContainEqual({ key: 'X-XSS-Protection', value: '0' });
  });
});
