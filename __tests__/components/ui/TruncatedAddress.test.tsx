import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import TruncatedAddress from '@/components/ui/TruncatedAddress';

describe('TruncatedAddress', () => {
  const mockAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

  it('renders truncated address', () => {
    render(<TruncatedAddress address={mockAddress} />);
    expect(screen.getByText('GABC…7890')).toBeInTheDocument();
  });

  it('renders nothing when address is empty', () => {
    render(<TruncatedAddress address="" />);
    expect(screen.queryByText('GABC…7890')).not.toBeInTheDocument();
  });

  it('renders copy button by default', () => {
    render(<TruncatedAddress address={mockAddress} />);
    const button = screen.getByTitle('Click to copy address');
    expect(button).toBeInTheDocument();
  });

  it('does not render copy button when copyable is false', () => {
    render(<TruncatedAddress address={mockAddress} copyable={false} />);
    expect(
      screen.queryByTitle('Click to copy address'),
    ).not.toBeInTheDocument();
  });

  it('copies address to clipboard on click', async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TruncatedAddress address={mockAddress} />);
    const button = screen.getByTitle('Click to copy address');

    await fireEvent.click(button);

    expect(writeTextMock).toHaveBeenCalledWith(mockAddress);
  });

  it('shows checkmark icon after copying', async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TruncatedAddress address={mockAddress} />);
    const button = screen.getByTitle('Click to copy address');

    await fireEvent.click(button);

    expect(screen.getByRole('button')).toContainElement(
      screen.getByTitle('Click to copy address'),
    );
  });

  it('applies custom className', () => {
    render(<TruncatedAddress address={mockAddress} className="custom-class" />);
    const button = screen.getByTitle('Click to copy address');
    expect(button).toHaveClass('custom-class');
  });

  // ── #1780 ────────────────────────────────────────────────────────────────
  it('is type="button" so it never submits an enclosing form', () => {
    const onSubmit = jest.fn((event: React.FormEvent) =>
      event.preventDefault(),
    );
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    render(
      <form onSubmit={onSubmit}>
        <TruncatedAddress address={mockAddress} />
      </form>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('has an accessible name with the full address and hides its icons', () => {
    const { container } = render(<TruncatedAddress address={mockAddress} />);
    expect(
      screen.getByRole('button', { name: new RegExp(mockAddress) }),
    ).toBeInTheDocument();
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('announces the copy in a status live region', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    render(<TruncatedAddress address={mockAddress} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Address copied',
    );
  });

  it('clears its reset timer on unmount', async () => {
    jest.useFakeTimers();
    try {
      Object.assign(navigator, {
        clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { unmount } = render(<TruncatedAddress address={mockAddress} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });
      unmount();
      expect(clearSpy).toHaveBeenCalled();
      jest.advanceTimersByTime(3000);
      expect(errorSpy).not.toHaveBeenCalled();
      clearSpy.mockRestore();
      errorSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});
