import { useId, type InputHTMLAttributes } from 'react';
import './Field.css';

export interface DatePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/**
 * Labeled date picker. Uses the native date input for accessibility and zero
 * dependencies; can be upgraded to a custom calendar later without changing
 * the public props.
 */
export function DatePicker({
  label,
  hint,
  error,
  required,
  id,
  className = '',
  ...rest
}: DatePickerProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`fg-field ${error ? 'fg-field--error' : ''}`}>
      {label ? (
        <label className="fg-field__label" htmlFor={inputId}>
          {label}
          {required ? <span className="fg-field__required">*</span> : null}
        </label>
      ) : null}
      <input
        id={inputId}
        type="date"
        className={`fg-input ${className}`}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${inputId}-message` : undefined}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-message`} className="fg-field__error">{error}</span>
      ) : hint ? (
        <span id={`${inputId}-message`} className="fg-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
