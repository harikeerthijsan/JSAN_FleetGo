import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import './FilterPanel.css';

export interface FilterPanelProps {
  title?: string;
  children: ReactNode;
  /** Actions rendered in the footer (e.g. Apply / Reset). */
  footer?: ReactNode;
}

/**
 * Container that groups filter controls (selects, date pickers, etc.) into a
 * consistent panel. Layout only — the filtering logic lives in each module.
 */
export function FilterPanel({ title = 'Filters', children, footer }: FilterPanelProps) {
  return (
    <div className="fg-filter">
      <div className="fg-filter__header">
        <Icon name="filter" size={16} />
        <span>{title}</span>
      </div>
      <div className="fg-filter__body">{children}</div>
      {footer ? <div className="fg-filter__footer">{footer}</div> : null}
    </div>
  );
}
