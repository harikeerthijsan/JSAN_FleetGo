import type { InputHTMLAttributes } from 'react';
import { Icon } from '../Icon/Icon';
import './SearchBar.css';

export interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Controlled value callback convenience. */
  onValueChange?: (value: string) => void;
}

/** Search input with a leading icon. Reusable across all list views. */
export function SearchBar({
  placeholder = 'Search…',
  onValueChange,
  onChange,
  className = '',
  ...rest
}: SearchBarProps) {
  return (
    <div className={`fg-search ${className}`}>
      <Icon name="search" size={18} className="fg-search__icon" />
      <input
        type="search"
        aria-label={rest['aria-label'] ?? 'Search records'}
        className="fg-search__input"
        placeholder={placeholder}
        onChange={(e) => {
          onValueChange?.(e.target.value);
          onChange?.(e);
        }}
        {...rest}
      />
    </div>
  );
}
