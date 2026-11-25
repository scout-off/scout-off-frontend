import { render, screen } from '@testing-library/react';
import ProgressBar from '@/components/ProgressBar';
import { PROGRESS_LEVELS, getProgressLabel } from '@/lib/progress';
import type { ProgressLevel } from '@/types';

describe('ProgressBar', () => {
  const levels: ProgressLevel[] = [0, 1, 2, 3];

  it.each(levels)('renders at progress level %i', (level) => {
    render(<ProgressBar level={level} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuenow', String(level));
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it.each(levels)('exposes accessible label matching level %i', (level) => {
    render(<ProgressBar level={level} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute(
      'aria-label',
      `Progress level: ${getProgressLabel(level)}`,
    );
  });

  it('renders every step label', () => {
    render(<ProgressBar level={1} />);

    PROGRESS_LEVELS.forEach(({ level }) => {
      expect(screen.getByText(getProgressLabel(level))).toBeInTheDocument();
    });
  });

  it('clamps out-of-range levels', () => {
    const { rerender } = render(<ProgressBar level={5 as ProgressLevel} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');

    rerender(<ProgressBar level={-1 as ProgressLevel} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
