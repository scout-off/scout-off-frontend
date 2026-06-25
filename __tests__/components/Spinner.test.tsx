import { render, screen } from "@testing-library/react";
import Spinner from "@/components/ui/Spinner";

describe("Spinner", () => {
  it("renders without throwing", () => {
    expect(() => render(<Spinner />)).not.toThrow();
  });

  it("has role=status for screen reader accessibility", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label for screen reader accessibility", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("renders with sm size", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toHaveClass("h-4", "w-4");
  });

  it("renders with md size (default)", () => {
    render(<Spinner size="md" />);
    expect(screen.getByRole("status")).toHaveClass("h-6", "w-6");
  });

  it("renders with lg size", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("h-8", "w-8");
  });

  it("snapshot", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toMatchSnapshot();
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
