import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
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

  it('shows the tooltip on hover and hides it on mouse leave', async () => {
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Extra info');

    fireEvent.mouseLeave(trigger);
    // Hidden after a short grace period so the pointer can move onto the
    // tooltip itself (WCAG 1.4.13 hoverable).
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );
  });

  it('shows the tooltip on focus and hides it on blur', async () => {
    render(
      <Tooltip content="Extra info">
        <span>Hover me</span>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );
  });

  it('stays visible while hovered instead of auto-hiding (WCAG 1.4.13 persistent)', () => {
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
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    jest.useRealTimers();
  });
});
