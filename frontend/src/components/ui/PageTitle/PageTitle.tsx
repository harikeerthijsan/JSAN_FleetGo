import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs/Breadcrumbs';
import './PageTitle.css';

export interface PageTitleProps {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Right-aligned actions (buttons, search, etc.). */
  actions?: ReactNode;
}

/** Standard page header: breadcrumbs + title + description + actions. */
export function PageTitle({
  title,
  description,
  breadcrumbs,
  actions,
}: PageTitleProps) {
  return (
    <div className="fg-pagetitle">
      <div className="fg-pagetitle__text">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumbs items={breadcrumbs} />
        ) : null}
        <h1 className="fg-pagetitle__heading">{title}</h1>
        {description ? (
          <p className="fg-pagetitle__desc">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="fg-pagetitle__actions">{actions}</div> : null}
    </div>
  );
}
