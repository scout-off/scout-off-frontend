import { IPFS_FALLBACK_GATEWAYS } from '@/lib/ipfsGateways';

type RemotePattern = { protocol?: string; hostname: string };

// Load next.config.js with its wrappers mocked to identity so requiring it has
// no side effects (PWA, bundle analyzer, next-intl, Sentry).
function loadRemotePatterns(): RemotePattern[] {
  let patterns: RemotePattern[] = [];
  jest.isolateModules(() => {
    jest.doMock('next-pwa', () => () => (config: unknown) => config, {
      virtual: true,
    });
    jest.doMock('@next/bundle-analyzer', () => () => (config: unknown) => config, {
      virtual: true,
    });
    jest.doMock('next-intl/plugin', () => () => (config: unknown) => config, {
      virtual: true,
    });
    jest.doMock('@sentry/nextjs', () => ({
      withSentryConfig: (config: unknown) => config,
    }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../next.config.js');
    patterns = config.images.remotePatterns;
  });
  return patterns;
}

// Next.js semantics: `*` matches one subdomain segment, `**` matches any number.
function hostMatches(pattern: string, host: string): boolean {
  const source = pattern
    .split('.')
    .map((part) =>
      part === '**'
        ? '.+'
        : part === '*'
          ? '[^.]+'
          : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('\\.');
  return new RegExp(`^${source}$`).test(host);
}

describe('hostMatches', () => {
  it('matches exact hosts', () => {
    expect(hostMatches('ipfs.io', 'ipfs.io')).toBe(true);
    expect(hostMatches('ipfs.io', 'evil.ipfs.io')).toBe(false);
  });

  it('treats * as a single segment and ** as any number', () => {
    expect(hostMatches('*.example.com', 'a.example.com')).toBe(true);
    expect(hostMatches('*.example.com', 'a.b.example.com')).toBe(false);
    expect(hostMatches('**.example.com', 'a.b.example.com')).toBe(true);
    expect(hostMatches('**.example.com', 'example.com')).toBe(false);
  });
});

describe('next.config.js images.remotePatterns', () => {
  const patterns = loadRemotePatterns();

  it('defines remote patterns', () => {
    expect(patterns.length).toBeGreaterThan(0);
  });

  it.each(IPFS_FALLBACK_GATEWAYS.map((gateway) => [gateway]))(
    'allows fallback gateway %s over https',
    (gateway) => {
      const { protocol, hostname } = new URL(gateway);
      const covered = patterns.some(
        (p) =>
          (p.protocol ?? 'https') === protocol.replace(':', '') &&
          hostMatches(p.hostname, hostname),
      );
      expect(covered).toBe(true);
    },
  );
});
