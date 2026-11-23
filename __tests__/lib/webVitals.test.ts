import type { Metric } from 'web-vitals';

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
  computeRoute: jest.fn(),
}));

import { track, computeRoute } from '@vercel/analytics';
import { reportWebVital } from '@/lib/webVitals';

const mockTrack = track as jest.Mock;
const mockComputeRoute = computeRoute as jest.Mock;

function makeMetric(overrides: Partial<Metric>): Metric {
  return {
    name: 'LCP',
    value: 1234.56,
    rating: 'good',
    delta: 0,
    id: 'v1-123',
    navigationType: 'navigate',
    entries: [],
    ...overrides,
  } as Metric;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportWebVital', () => {
  it('sends the metric name, rounded value, and rating tagged with the computed route', () => {
    mockComputeRoute.mockReturnValue('/[locale]/player/[id]');

    reportWebVital(
      makeMetric({ name: 'LCP', value: 2500.4, rating: 'good' }),
      '/en/player/GABCDEF',
      { locale: 'en', id: 'GABCDEF' },
    );

    expect(mockComputeRoute).toHaveBeenCalledWith('/en/player/GABCDEF', {
      locale: 'en',
      id: 'GABCDEF',
    });
    expect(mockTrack).toHaveBeenCalledWith('Web Vitals: LCP', {
      value: 2500,
      rating: 'good',
      route: '/[locale]/player/[id]',
    });
  });

  it('never includes the raw pathname when it contains a dynamic (potentially PII) segment', () => {
    mockComputeRoute.mockReturnValue('/[locale]/player/[id]');

    reportWebVital(
      makeMetric({ name: 'INP', value: 180, rating: 'needs-improvement' }),
      '/en/player/GSECRETWALLETADDRESS',
      { locale: 'en', id: 'GSECRETWALLETADDRESS' },
    );

    const [, properties] = mockTrack.mock.calls[0];
    expect(properties.route).not.toContain('GSECRETWALLETADDRESS');
  });

  it('scales CLS values so sub-1 scores are not rounded away to 0', () => {
    mockComputeRoute.mockReturnValue('/[locale]');

    reportWebVital(
      makeMetric({ name: 'CLS', value: 0.0847, rating: 'good' }),
      '/en',
      { locale: 'en' },
    );

    expect(mockTrack).toHaveBeenCalledWith('Web Vitals: CLS', {
      value: 85,
      rating: 'good',
      route: '/[locale]',
    });
  });

  it('falls back to the raw pathname when computeRoute returns null', () => {
    mockComputeRoute.mockReturnValue(null);

    reportWebVital(makeMetric({ name: 'TTFB', value: 400 }), '/en', null);

    expect(mockTrack).toHaveBeenCalledWith(
      'Web Vitals: TTFB',
      expect.objectContaining({ route: '/en' }),
    );
  });

  it('falls back to "unknown" when both computeRoute and pathname are unavailable', () => {
    mockComputeRoute.mockReturnValue(null);

    reportWebVital(makeMetric({ name: 'TTFB', value: 400 }), null, null);

    expect(mockTrack).toHaveBeenCalledWith(
      'Web Vitals: TTFB',
      expect.objectContaining({ route: 'unknown' }),
    );
  });
});
