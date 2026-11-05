import './Spinner.css';

export interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  /** Center within a padded block (useful for full-panel loading). */
  block?: boolean;
  label?: string;
}

/** Loading indicator. */
export function Spinner({ size = 24, block = false, label }: SpinnerProps) {
  const spinner = (
    <span
      className="fg-spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label={label ?? 'Loading'}
    />
  );

  if (!block) return spinner;

  return (
    <div className="fg-spinner-block">
      {spinner}
      {label ? <span className="fg-spinner-label">{label}</span> : null}
    </div>
  );
}
