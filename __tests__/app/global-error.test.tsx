import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GlobalError from '@/app/global-error';

const captureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

describe('GlobalError', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    captureException.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example.ingest.sentry.io/1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it('renders the fallback with the error reference without any providers', () => {
    const error = Object.assign(new Error('layout crashed'), {
      digest: 'abc123',
    });
    render(<GlobalError error={error} reset={jest.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('calls reset when "Try again" is clicked', () => {
    const reset = jest.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('reports the error to Sentry', async () => {
    const error = new Error('reported error');
    render(<GlobalError error={error} reset={jest.fn()} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureException).toHaveBeenCalledWith(error);
  });
});
