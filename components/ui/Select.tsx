'use client';

import { SelectHTMLAttributes, ReactNode, forwardRef, useId } from 'react';
import { FieldProps, mergeDescribedBy } from './fieldProps';

export interface SelectProps
  extends
    Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required'>,
    FieldProps {
  children: ReactNode;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, id, label, error, hint, required, className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className="space-y-1">
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={`w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green transition ${
          error ? 'border-red-500' : ''
        } ${className}`}
        required={required}
        {...props}
        aria-required={required || undefined}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={mergeDescribedBy(
          props['aria-describedby'],
          hintId,
          errorId,
        )}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className="text-sm text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
