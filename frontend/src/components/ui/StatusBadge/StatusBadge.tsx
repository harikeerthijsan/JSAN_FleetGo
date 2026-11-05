import type { ReactNode } from 'react';
import './StatusBadge.css';

export type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Render a small leading dot. */
  dot?: boolean;
}

/** Compact colored label for statuses (available, reserved, in-transit, etc.). */
export function StatusBadge({
  tone = 'neutral',
  dot = true,
  children,
}: StatusBadgeProps) {
  return (
    <span className={`fg-badge fg-badge--${tone}`}>
      {dot ? <span className="fg-badge__dot" /> : null}
      {children}
    </span>
  );
}
