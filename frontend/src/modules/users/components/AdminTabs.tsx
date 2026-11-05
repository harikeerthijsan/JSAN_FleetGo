import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './AdminTabs.css';

interface Tab {
  to: string;
  label: string;
  anyOf: string[];
}

const TABS: Tab[] = [
  { to: '/users', label: 'Users', anyOf: ['users:read'] },
  { to: '/roles', label: 'Roles & Permissions', anyOf: ['roles:read'] },
  { to: '/organizations', label: 'Organizations', anyOf: ['organizations:read'] },
];

/** Sub-navigation across the administration screens, filtered by permission. */
export function AdminTabs() {
  const { hasAnyPermission } = useAuth();
  const visible = TABS.filter((t) => hasAnyPermission(t.anyOf));
  if (visible.length <= 1) return null;

  return (
    <div className="fg-admin-tabs">
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `fg-admin-tabs__tab ${isActive ? 'is-active' : ''}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
