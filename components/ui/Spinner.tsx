"use client";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export default function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      className={`animate-spin ${sizeClasses[size]}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
import React from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg';

export const SPINNER_SIZE_PIXEL_MAP = {
  sm: 16,
  md: 24,
  lg: 40,
} as const;

const BASE_CLASSES = 'inline-flex items-center justify-center rounded-full';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
};

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  className?: string;
}

export default function Spinner({
  size = 'md',
  className,
  ...rest
}: SpinnerProps) {
  const classes = [className, BASE_CLASSES, SIZE_CLASSES[size]]
    .filter(Boolean)
    .join(' ');

  return (
    <span role="status" aria-label="Loading" className={classes} {...rest}>
      <svg
        data-testid="spinner-svg"
        className="h-full w-full animate-spin text-current"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <span className="sr-only">Loading</span>
    </span>
  );
}
