import { render, screen, fireEvent, act } from '@testing-library/react';
import Tooltip from '@/components/ui/Tooltip';

describe('Tooltip', () => {
  it('does not render the tooltip content until triggered', () => {
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on hover and hides it on mouse leave', () => {
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Extra info');

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and hides it on blur', () => {
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('auto-hides the tooltip after the timeout elapses', () => {
    jest.useFakeTimers();
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByText('Hover me'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
