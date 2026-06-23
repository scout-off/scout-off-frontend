import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Spinner, { SPINNER_SIZE_PIXEL_MAP } from '../../components/ui/Spinner';

describe('Spinner', () => {
  test('renders accessible spinner with status role and loading label', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  test('renders SVG spinner and uses animate-spin', () => {
    render(<Spinner />);
    const svg = screen.getByTestId('spinner-svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('animate-spin');
  });

  test('applies correct dimensions for each size', () => {
    const { rerender } = render(<Spinner size="sm" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'w-4',
      'h-4',
    );

    rerender(<Spinner size="md" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'w-6',
      'h-6',
    );

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'w-10',
      'h-10',
    );
  });

  test('exports strict size pixel map', () => {
    expect(SPINNER_SIZE_PIXEL_MAP).toEqual({ sm: 16, md: 24, lg: 40 });
  });

  test('merges className safely while preserving required base styles', () => {
    render(<Spinner className="text-red-500" />);
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(spinner).toHaveClass(
      'inline-flex',
      'justify-center',
      'items-center',
    );
    expect(spinner).toHaveClass('text-red-500');
  });
});
