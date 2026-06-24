import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Forward to Sentry in production if configured
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV !== 'production';
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <h2 className="text-xl font-semibold text-white">
            Something went wrong
          </h2>
          <p className="text-gray-400 text-center max-w-md">
            An error occurred while rendering this page. Please try again.
          </p>
          {isDev && this.state.error && (
            <pre className="text-xs text-red-400 bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-xl w-full overflow-auto text-left">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="bg-brand-green text-black font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
