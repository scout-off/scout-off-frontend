import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const ERROR_MESSAGE = 'Test error';

// Mock @sentry/nextjs so tests don't require a real Sentry DSN and we can
// assert that captureException / withScope are called correctly (issue #1495).
const mockCaptureException = jest.fn();
const mockWithScope = jest.fn((cb: (scope: unknown) => void) => cb({ setContext: jest.fn() }));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  withScope: (cb: (scope: unknown) => void) => mockWithScope(cb),
}));

function ThrowingComponent(): never {
  throw new Error(ERROR_MESSAGE);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCaptureException.mockClear();
    mockWithScope.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders fallback UI when a child component throws during render', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(
        'An error occurred while rendering this page. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ERROR_MESSAGE))).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls Sentry.captureException when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    // withScope should have been called once to set the react context
    expect(mockWithScope).toHaveBeenCalledTimes(1);
    // captureException should have been called with the thrown error
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: ERROR_MESSAGE }),
    );
  });

  it('Try Again button resets error state and re-renders children', () => {
    let throwError = true;
    function ConditionalThrowingComponent() {
      if (throwError) {
        throw new Error(ERROR_MESSAGE);
      }
      return <div>Recovered successfully</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    throwError = false;

    fireEvent.click(screen.getByText('Try again'));

    expect(screen.getByText('Recovered successfully')).toBeInTheDocument();
  });

  // Issue #23 AC #3 — error details must not leak to end users in
  // production builds. The <pre> block that surfaces error.message +
  // stack is gated by `process.env.NODE_ENV !== 'production'`, so we
  // override NODE_ENV to verify it is suppressed. The friendly
  // 'Something went wrong' + 'Try again' recovery UI must still render
  // either way — this also guards against an accidental
  // over-aggressive gating regression.
  it('hides error details when NODE_ENV=production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    // @ts-expect-error NODE_ENV is readonly in the type system but assignable at runtime
    process.env.NODE_ENV = 'production';
    try {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>,
      );

      // Recovery UI is still present in production.
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText(
          'An error occurred while rendering this page. Please try again.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();

      // Error message text is NOT present (locks in AC #3).
      expect(
        screen.queryByText(new RegExp(ERROR_MESSAGE)),
      ).not.toBeInTheDocument();
    } finally {
      // @ts-expect-error NODE_ENV is readonly in the type system but assignable at runtime
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
