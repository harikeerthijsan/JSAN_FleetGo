import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './TicketTabs.css';

interface Tab {
  to: string;
  label: string;
  end?: boolean;
  anyOf?: string[];
}

const TABS: Tab[] = [
  { to: '/tickets', label: 'Dashboard', end: true },
  { to: '/tickets/list', label: 'All Tickets' },
  { to: '/tickets/mine', label: 'My Tickets' },
  { to: '/tickets/new', label: 'Create', anyOf: ['tickets:create'] },
  { to: '/tickets/inbox', label: 'Approval Inbox', anyOf: ['tickets:approve'] },
  { to: '/tickets/sla', label: 'SLA', anyOf: ['tickets:read'] },
  { to: '/tickets/reports', label: 'Reports', anyOf: ['tickets:read'] },
  { to: '/tickets/workflows', label: 'Workflows', anyOf: ['tickets:manage'] },
];

/** Sub-navigation for the Ticketing module, filtered by permission. */
export function TicketTabs() {
  const { hasAnyPermission, user } = useAuth();
  const visible = TABS.filter((t) => (!t.anyOf || hasAnyPermission(t.anyOf)) && (t.to !== '/tickets/workflows' || ['SUPER_ADMIN','JSAN_ADMIN'].includes(user?.role.name??'')));
  return (
    <div className="fg-tk-tabs">
      {visible.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `fg-tk-tabs__tab ${isActive ? 'is-active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
