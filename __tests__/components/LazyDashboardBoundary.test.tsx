import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { createLazyDashboard } from '@/components/dashboard/LazyDashboardBoundary';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLazyDashboard', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('shows the fallback while suspended, then renders the child', async () => {
    const { promise, resolve } = deferred<{
      default: (p: { name: string }) => JSX.Element;
    }>();
    const Dashboard = createLazyDashboard(() => promise);

    const { container } = render(<Dashboard name="Ada" />);
    expect(container.querySelector('.py-16')).toBeInTheDocument();
    expect(screen.queryByText('Hello Ada')).not.toBeInTheDocument();

    await act(async () => {
      resolve({ default: ({ name }) => <p>Hello {name}</p> });
      await promise;
    });

    expect(await screen.findByText('Hello Ada')).toBeInTheDocument();
    expect(container.querySelector('.py-16')).not.toBeInTheDocument();
  });

  it('shows an error fallback with retry, and retry re-renders the child', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('boom');
      return <p>Loaded</p>;
    }
    const Dashboard = createLazyDashboard(() =>
      Promise.resolve({ default: Flaky }),
    );

    render(<Dashboard />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(retry);

    expect(await screen.findByText('Loaded')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
