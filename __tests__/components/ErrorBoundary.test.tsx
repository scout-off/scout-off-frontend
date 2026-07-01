import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const ERROR_MESSAGE = 'Test error';

function ThrowingComponent() {
  throw new Error(ERROR_MESSAGE);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (window as any).Sentry = undefined;
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

  it('calls Sentry when an error is caught and Sentry is available', () => {
    const captureException = jest.fn();
    (window as any).Sentry = { captureException };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: ERROR_MESSAGE }),
      expect.objectContaining({
        contexts: expect.objectContaining({
          react: expect.objectContaining({
            componentStack: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('does not call Sentry when Sentry is unavailable', () => {
    const captureException = jest.fn();
    (window as any).Sentry = undefined;

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    // cleanup to ensure nothing calls Sentry from the global scope
    expect((window as any).Sentry).toBeUndefined();
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
});
