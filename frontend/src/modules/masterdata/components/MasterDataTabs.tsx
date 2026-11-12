import { NavLink } from 'react-router-dom';
import './MasterDataTabs.css';

const TABS = [
  { to: '/master-data', label: 'Overview', end: true },
  { to: '/master-data/makes-models', label: 'Makes & Models', end: false },
  { to: '/master-data/depots', label: 'Depots', end: false },
  { to: '/master-data/vendors', label: 'Vendors & Partners', end: false },
  { to: '/master-data/lookups', label: 'Lookups', end: false },
];

export function MasterDataTabs() {
  return (
    <div className="fg-md-tabs">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => `fg-md-tabs__tab ${isActive ? 'is-active' : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
