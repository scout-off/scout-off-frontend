'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import Spinner from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'danger' | 'secondary';
  children: ReactNode;
  isLoading?: boolean;
  /** When provided, renders helper text and uses aria-disabled instead of native disabled to keep button focusable */
  disabledReason?: string;
}

export default function Button({
  variant = 'default',
  isLoading = false,
  children,
  className = '',
  disabled,
  disabledReason,
  onClick,
  ...props
}: ButtonProps) {
  const isDisabledByReason = !!disabledReason;
  const isDisabled = disabled || isLoading || isDisabledByReason;

  const baseStyles =
    'px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900';

  const variants = {
    default: 'bg-brand-green text-black hover:opacity-90',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    secondary:
      'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600',
  };

  const hintId = disabledReason ? `button-hint-${Math.random().toString(36).substr(2, 9)}` : undefined;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabledByReason) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <>
      <button
        className={`${baseStyles} ${variants[variant]} ${className}`}
        disabled={!isDisabledByReason && isDisabled}
        aria-disabled={isDisabledByReason ? 'true' : undefined}
        aria-describedby={hintId}
        onClick={handleClick}
        {...props}
      >
        {isLoading && <Spinner size="sm" />}
        {children}
      </button>
      {disabledReason && (
        <p id={hintId} className="text-xs text-gray-400 mt-1">
          {disabledReason}
        </p>
      )}
    </>
  );
}
