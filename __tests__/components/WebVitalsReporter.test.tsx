import React from 'react';
import { render } from '@testing-library/react';

const mockOnLCP = jest.fn();
const mockOnCLS = jest.fn();
const mockOnINP = jest.fn();
const mockOnTTFB = jest.fn();

jest.mock('web-vitals', () => ({
  onLCP: (cb: unknown) => mockOnLCP(cb),
  onCLS: (cb: unknown) => mockOnCLS(cb),
  onINP: (cb: unknown) => mockOnINP(cb),
  onTTFB: (cb: unknown) => mockOnTTFB(cb),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/en/player/GABCDEF'),
  useParams: jest.fn(() => ({ locale: 'en', id: 'GABCDEF' })),
}));

jest.mock('@/lib/webVitals', () => ({
  reportWebVital: jest.fn(),
}));

import { reportWebVital } from '@/lib/webVitals';
import WebVitalsReporter from '@/components/WebVitalsReporter';

const mockReportWebVital = reportWebVital as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WebVitalsReporter', () => {
  it('renders nothing', () => {
    const { container } = render(<WebVitalsReporter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('registers a callback for each of LCP, CLS, INP, and TTFB', () => {
    render(<WebVitalsReporter />);

    expect(mockOnLCP).toHaveBeenCalledTimes(1);
    expect(mockOnCLS).toHaveBeenCalledTimes(1);
    expect(mockOnINP).toHaveBeenCalledTimes(1);
    expect(mockOnTTFB).toHaveBeenCalledTimes(1);
  });

  it('forwards each reported metric to reportWebVital with the current route and params', () => {
    render(<WebVitalsReporter />);

    const lcpCallback = mockOnLCP.mock.calls[0][0];
    const metric = { name: 'LCP', value: 1200, rating: 'good' };

    lcpCallback(metric);

    expect(mockReportWebVital).toHaveBeenCalledWith(
      metric,
      '/en/player/GABCDEF',
      { locale: 'en', id: 'GABCDEF' },
    );
  });

  it('registers listeners only once when re-rendered', () => {
    const { rerender } = render(<WebVitalsReporter />);
    rerender(<WebVitalsReporter />);

    expect(mockOnLCP).toHaveBeenCalledTimes(1);
  });
});
