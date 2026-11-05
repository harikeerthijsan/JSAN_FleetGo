import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import './States.css';

interface BaseStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** Shown when a list/collection has no items. */
export function EmptyState({
  title,
  description,
  action,
  icon = 'inbox',
}: BaseStateProps & { icon?: IconName }) {
  return (
    <div className="fg-state">
      <span className="fg-state__icon fg-state__icon--neutral">
        <Icon name={icon} size={28} />
      </span>
      <h4 className="fg-state__title">{title}</h4>
      {description ? (
        <p className="fg-state__desc">{description}</p>
      ) : null}
      {action ? <div className="fg-state__action">{action}</div> : null}
    </div>
  );
}

/** Shown when something failed to load. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: Partial<BaseStateProps>) {
  return (
    <div className="fg-state">
      <span className="fg-state__icon fg-state__icon--danger">
        <Icon name="alert" size={28} />
      </span>
      <h4 className="fg-state__title">{title}</h4>
      {description ? (
        <p className="fg-state__desc">{description}</p>
      ) : null}
      {action ? <div className="fg-state__action">{action}</div> : null}
    </div>
  );
}
