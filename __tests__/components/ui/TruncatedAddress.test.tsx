import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.queryByTitle('Click to copy address')).not.toBeInTheDocument();
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
    
    expect(screen.getByRole('button')).toContainElement(screen.getByTitle('Click to copy address'));
  });

  it('applies custom className', () => {
    render(<TruncatedAddress address={mockAddress} className="custom-class" />);
    const button = screen.getByTitle('Click to copy address');
    expect(button).toHaveClass('custom-class');
  });
});
