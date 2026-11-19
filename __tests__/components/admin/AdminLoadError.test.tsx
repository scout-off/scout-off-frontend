import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import AdminLoadError from '@/components/admin/AdminLoadError';

expect.extend(toHaveNoViolations);

describe('AdminLoadError', () => {
  it('renders the error message and retry button', () => {
    render(<AdminLoadError onRetry={jest.fn()} />);
    expect(screen.getByText(/failed to load admin data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onRetry exactly once on click', async () => {
    const onRetry = jest.fn();
    render(<AdminLoadError onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('is reachable and activatable by keyboard', async () => {
    const onRetry = jest.fn();
    render(<AdminLoadError onRetry={onRetry} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<AdminLoadError onRetry={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
