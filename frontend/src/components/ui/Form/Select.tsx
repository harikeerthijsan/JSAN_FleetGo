import { useId, type SelectHTMLAttributes } from 'react';
import './Field.css';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

/** Labeled native select dropdown. */
export function Select({
  label,
  hint,
  error,
  required,
  options,
  placeholder,
  id,
  className = '',
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={`fg-field ${error ? 'fg-field--error' : ''}`}>
      {label ? (
        <label className="fg-field__label" htmlFor={selectId}>
          {label}
          {required ? <span className="fg-field__required">*</span> : null}
        </label>
      ) : null}
      <select
        id={selectId}
        className={`fg-select ${className}`}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${selectId}-message` : undefined}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={`${selectId}-message`} className="fg-field__error">{error}</span>
      ) : hint ? (
        <span id={`${selectId}-message`} className="fg-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
