'use client';

import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { FieldProps, mergeDescribedBy } from './fieldProps';

export interface TextareaProps
  extends
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'required'>,
    FieldProps {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { id, label, error, hint, required, className = '', ...props },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;
    const counterId = props.maxLength ? `${fieldId}-counter` : undefined;
    const length = String(props.value ?? '').length;

    return (
      <div className="space-y-1">
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          className={`input${error ? ' border-red-500' : ''}${className ? ` ${className}` : ''}`}
          required={required}
          {...props}
          aria-required={required || undefined}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={mergeDescribedBy(
            props['aria-describedby'],
            hintId,
            errorId,
            counterId,
          )}
        />
        {props.maxLength && (
          <p id={counterId} className="text-xs text-gray-500 text-right">
            {length}/{props.maxLength}
          </p>
        )}
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

Textarea.displayName = 'Textarea';
export default Textarea;
