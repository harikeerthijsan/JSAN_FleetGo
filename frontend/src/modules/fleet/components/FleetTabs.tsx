import { NavLink } from 'react-router-dom';
import './FleetTabs.css';

const TABS = [
  { to: '/fleet', label: 'Overview', end: true },
  { to: '/fleet/vehicles', label: 'Vehicles', end: false },
];

/** Sub-navigation for the Fleet module. */
export function FleetTabs() {
  return (
    <div className="fg-fleet-tabs">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `fg-fleet-tabs__tab ${isActive ? 'is-active' : ''}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
