import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon/Icon';
import './Breadcrumbs.css';

export interface Crumb {
  label: string;
  /** Omit `to` for the current (non-clickable) page. */
  to?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
}

/** Navigation breadcrumb trail. */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="fg-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {item.to && !isLast ? (
              <Link className="fg-breadcrumbs__link" to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span className="fg-breadcrumbs__current">{item.label}</span>
            )}
            {!isLast ? (
              <Icon
                name="chevron-right"
                size={14}
                className="fg-breadcrumbs__sep"
              />
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
