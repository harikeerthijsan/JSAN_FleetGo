import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Optional actions rendered on the right of the header. */
  actions?: ReactNode;
  /** Remove body padding (e.g. when embedding a table). */
  flush?: boolean;
  children?: ReactNode;
}

/** Generic surface container used across every module. */
export function Card({
  title,
  subtitle,
  actions,
  flush = false,
  children,
  className = '',
  ...rest
}: CardProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <div className={`fg-card ${className}`} {...rest}>
      {hasHeader ? (
        <div className="fg-card__header">
          <div>
            {title ? <h3 className="fg-card__title">{title}</h3> : null}
            {subtitle ? (
              <p className="fg-card__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="fg-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`fg-card__body ${flush ? 'fg-card__body--flush' : ''}`}>
        {children}
      </div>
    </div>
  );
}
