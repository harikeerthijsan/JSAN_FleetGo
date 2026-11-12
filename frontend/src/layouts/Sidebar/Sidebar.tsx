import { NavLink } from 'react-router-dom';
import countryDrive from '@/assets/cars/country-drive.jpg';
import { Icon } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useSidebar } from '@/context/SidebarContext';
import { useAppConfig } from '@/context/AppConfigContext';
import { NAV_ITEMS, navPermissions } from '@/routes/navigation';
import './Sidebar.css';

/**
 * Fixed, collapsible primary navigation. On mobile it becomes an overlay
 * drawer controlled by the SidebarContext. Items are filtered by the current
 * user's permissions (visibility only — the backend enforces authorization).
 */
export function Sidebar() {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();
  const { hasAnyPermission, hasPermission } = useAuth();
  const { publicSettings } = useAppConfig();
  const orgName = publicSettings?.organizationName?.trim() || 'FleetGo';

  const items = NAV_ITEMS.filter((item) => {
    const required = navPermissions(item);
    return required.length === 0 || hasAnyPermission(required);
  });

  const displayLabels: Record<string, string> = { '/inventory': 'Fleet Inventory', '/tickets': 'Requests & Approvals', '/dispatch': 'Allocation & Dispatch', '/vendors': 'Vendors & Partners' };
  const comingSoon = new Set<string>([]);
  const groups = [
    { label: 'Operations', paths: ['/dashboard', '/tickets', '/dispatch', '/tracking', '/inspections', '/claims'] },
    { label: 'Fleet & assets', paths: ['/inventory', '/vendors', '/disk-logistics'] },
    { label: 'Administration', paths: ['/master-data', '/users', '/reports', '/settings'] },
  ];
  return (
    <>
      <div
        className={`fg-sidebar__scrim ${mobileOpen ? 'is-open' : ''}`}
        onClick={closeMobile}
        role="presentation"
      />
      <aside
        className={[
          'fg-sidebar',
          collapsed ? 'fg-sidebar--collapsed' : '',
          mobileOpen ? 'fg-sidebar--mobile-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="fg-sidebar__brand">
          <span className="fg-sidebar__logo">
            <svg width="38" height="38" viewBox="0 0 56 56" fill="currentColor" aria-hidden="true"><path d="M3 3h50v12H15v38H3zM33 27h20v26H27V41h14V27z" /></svg>
          </span>
          {!collapsed ? (
            <span className="fg-sidebar__brand-text">
              {orgName === 'FleetGo' ? 'JSAN' : orgName}
            </span>
          ) : null}
          {!collapsed ? <span className="fg-sidebar__tagline">PEOPLE | TECHNOLOGY | PLACES</span> : null}
        </div>

        <nav className="fg-sidebar__nav" aria-label="Main navigation">
          {groups.map((group) => {
            const entries = items.filter((item) => group.paths.includes(item.path));
            if (!entries.length) return null;
            return <div className="fg-sidebar__group" key={group.label}>
              {!collapsed ? <p className="fg-sidebar__group-title">{group.label}</p> : null}
              {entries.map((item) => {
                const label = <><span className="fg-sidebar__link-icon"><Icon name={item.icon} size={20} /></span>
                  {!collapsed ? <span className="fg-sidebar__link-label">{displayLabels[item.path] ?? item.label}</span> : null}</>;
                if (comingSoon.has(item.path)) return <span key={item.path} className="fg-sidebar__link fg-sidebar__link--unavailable" aria-disabled="true" title={`${item.label} ? Coming soon`}>
                  {label}{!collapsed ? <span className="fg-sidebar__soon">Soon</span> : null}
                </span>;
                const destination = item.path === '/users' && !hasPermission('users:read')
                  ? hasPermission('roles:read') ? '/roles' : '/organizations' : item.path;
                return <NavLink key={item.path} to={destination} aria-label={item.label}
                  className={({ isActive }) => `fg-sidebar__link ${isActive ? 'is-active' : ''}`}
                  onClick={closeMobile} title={collapsed ? item.label : undefined}>{label}</NavLink>;
              })}
            </div>;
          })}
        </nav>

        {!collapsed ? (
          <div className="fg-sidebar__footer">
            <img className="fg-sidebar__footer-photo" src={countryDrive} alt="" loading="lazy" decoding="async" aria-hidden="true" />
            <span className="fg-sidebar__footer-title">FleetGo</span>
            <span className="fg-sidebar__footer-sub">
              CTS–Google Engagement
            </span>
          </div>
        ) : null}
      </aside>
    </>
  );
}

