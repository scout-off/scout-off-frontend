import { render, screen, fireEvent } from '@testing-library/react';
import Button from '@/components/ui/Button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(
      screen.getByRole('button', { name: /click me/i }),
    ).toBeInTheDocument();
  });

  it('renders with default variant styles', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-brand-green');
  });

  it('renders with secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('dark:bg-gray-700');
  });

  it('renders with danger variant styles', () => {
    render(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows loading spinner and disables button when isLoading is true', () => {
    render(<Button isLoading>Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('snapshot: default variant', () => {
    const { container } = render(<Button>Default</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('snapshot: secondary variant', () => {
    const { container } = render(
      <Button variant="secondary">Secondary</Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('snapshot: danger variant', () => {
    const { container } = render(<Button variant="danger">Danger</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('pause-gated accessibility (disabledReason)', () => {
    it('uses aria-disabled instead of native disabled when disabledReason is provided', () => {
      const onClick = jest.fn();
      render(
        <Button disabledReason="Temporarily unavailable — the platform is paused for maintenance" onClick={onClick}>
          Submit
        </Button>,
      );
      const btn = screen.getByRole('button');
      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
    });

    it('renders helper text linked via aria-describedby when disabledReason is provided', () => {
      render(
        <Button disabledReason="Temporarily unavailable — the platform is paused for maintenance">
          Submit
        </Button>,
      );
      const btn = screen.getByRole('button');
      const hintId = btn.getAttribute('aria-describedby');
      expect(hintId).toBeTruthy();
      const hint = screen.getByText('Temporarily unavailable — the platform is paused for maintenance');
      expect(hint).toHaveAttribute('id', hintId);
    });

    it('prevents click when disabledReason is provided', () => {
      const onClick = jest.fn();
      render(
        <Button disabledReason="Temporarily unavailable — the platform is paused for maintenance" onClick={onClick}>
          Submit
        </Button>,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('does not render helper text when disabledReason is not provided', () => {
      render(<Button>Submit</Button>);
      const btn = screen.getByRole('button');
      expect(btn).not.toHaveAttribute('aria-describedby');
      expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
    });

    it('button remains focusable when disabledReason is provided', () => {
      render(
        <Button disabledReason="Temporarily unavailable — the platform is paused for maintenance">
          Submit
        </Button>,
      );
      const btn = screen.getByRole('button');
      expect(btn).not.toBeDisabled();
      btn.focus();
      expect(btn).toHaveFocus();
    });
  });
});
