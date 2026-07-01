import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TruncatedAddress from '@/components/ui/TruncatedAddress';

const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQR';

describe('TruncatedAddress', () => {
  it('renders a truncated version of the address', () => {
    render(<TruncatedAddress address={ADDRESS} />);

    expect(
      screen.getByRole('button', { name: `Wallet address ${ADDRESS}` }),
    ).toHaveTextContent('GABC…OPQR');
  });

  it('renders short addresses unchanged', () => {
    render(<TruncatedAddress address="GSHORT" />);

    expect(screen.getByText('GSHORT')).toBeInTheDocument();
  });

  it('shows the tooltip with the full address on hover and hides on mouse leave', async () => {
    const user = userEvent.setup();
    render(<TruncatedAddress address={ADDRESS} />);

    const trigger = screen.getByRole('button', {
      name: `Wallet address ${ADDRESS}`,
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent(ADDRESS);

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and hides on blur', async () => {
    const user = userEvent.setup();
    render(<TruncatedAddress address={ADDRESS} />);

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('copies the full address to the clipboard and shows feedback', async () => {
    render(<TruncatedAddress address={ADDRESS} />);

    fireEvent.mouseEnter(
      screen.getByRole('button', { name: `Wallet address ${ADDRESS}` }),
    );
    const writeTextSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Copy full address to clipboard',
        }),
      );
    });

    expect(writeTextSpy).toHaveBeenCalledWith(ADDRESS);
  });

  it('auto-hides the tooltip after the timeout elapses', () => {
    jest.useFakeTimers();
    render(<TruncatedAddress address={ADDRESS} />);

    const trigger = screen.getByRole('button', {
      name: `Wallet address ${ADDRESS}`,
    });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
