'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { FieldProps, mergeDescribedBy } from './fieldProps';

export interface InputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'>,
    FieldProps {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { id: idProp, label, error, hint, required, className = '', ...props },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = mergeDescribedBy(
      props['aria-describedby'],
      hintId,
      errorId,
    );

    return (
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        <input
          ref={ref}
          id={id}
          className={`input${error ? ' border-red-500' : ''}${className ? ` ${className}` : ''}`}
          required={required}
          {...props}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? true : props['aria-invalid']}
        />
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
  },
);

Input.displayName = 'Input';

export default Input;
