import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ProgressLevel } from '@/types';
import ProgressBar from '@/components/ProgressBar';

describe('ProgressBar', () => {
  it('renders 0% fill and aria attributes for level 0', () => {
    render(<ProgressBar level={0 as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.firstChild).toHaveStyle({ width: '0%' });
  });

  it('renders 100% fill and aria attributes for level 3', () => {
    render(<ProgressBar level={3 as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar.firstChild).toHaveStyle({ width: '100%' });
  });

  it('clamps an above-range level to a 100% fill instead of overflowing', () => {
    render(<ProgressBar level={5 as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar.firstChild).toHaveStyle({ width: '100%' });
  });

  it('clamps a negative level to a 0% fill instead of a negative width', () => {
    render(<ProgressBar level={-1 as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.firstChild).toHaveStyle({ width: '0%' });
  });

  it('treats a NaN level as 0 rather than propagating NaN into the width', () => {
    render(<ProgressBar level={NaN as unknown as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.firstChild).toHaveStyle({ width: '0%' });
  });

  it('falls back to a defined label for an out-of-range level instead of rendering blank/undefined', () => {
    render(<ProgressBar level={5 as ProgressLevel} />);
    const bar = screen.getByRole('progressbar');
    const label = bar.getAttribute('aria-label');
    expect(label).not.toContain('undefined');
    expect(label).toBeTruthy();
  });
});
