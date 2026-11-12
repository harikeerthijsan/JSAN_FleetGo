import type { IconName } from '@/components';

/**
 * Single source of truth for the application's primary navigation. Both the
 * sidebar and the router derive from this list.
 *
 * `permission` gates sidebar visibility (and is enforced again on the backend
 * for every protected API — hiding a menu item is never the security boundary).
 * An item with no `permission` is always visible to authenticated users. When
 * `permission` is an array, the item is shown if the user holds ANY of them.
 *
 * NOTE: Inventory Management is an INDEPENDENT top-level item — it is
 * deliberately NOT nested under Fleet Management.
 */
export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  description: string;
  permission?: string | string[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    description:
      'Operational overview and key fleet logistics metrics at a glance.',
    permission: 'dashboard:view',
  },
  {
    path: '/master-data',
    label: 'Master Data',
    icon: 'settings',
    description:
      'Reference data: makes, models, types, categories, fuel/ownership/document types and depots.',
    permission: 'masterdata:read',
  },
  {
    path: '/inventory',
    label: 'Inventory Management',
    icon: 'inventory',
    description:
      'Centralized inventory of vehicles received from Google CTS — depots, custody, reservations, movements and reconciliation.',
    permission: 'inventory:read',
  },
  {
    path: '/tickets',
    label: 'Ticketing & Approvals',
    icon: 'tickets',
    description: 'Raise vehicle requests and manage multi-step approvals.',
    permission: 'tickets:read',
  },
  {
    path: '/dispatch',
    label: 'Allocation, Dispatch & Trips',
    icon: 'dispatch',
    description:
      'Allocate and dispatch vehicles, and track trips through delivery.',
    permission: ['allocation:manage', 'dispatch:read'],
  },
  {
    path: '/tracking',
    label: 'Live Tracking',
    icon: 'tracking',
    description: 'Real-time GPS location of vehicles in transit.',
    permission: 'tracking:read',
  },
  {
    path: '/inspections',
    label: 'Inspections & Handover',
    icon: 'inspections',
    description:
      'Capture vehicle condition and perform digital handovers at dispatch and receiving.',
    permission: ['inspections:read', 'inspections:confirm'],
  },
  {
    path: '/vendors',
    label: 'Vendor Management',
    icon: 'vendors',
    description: 'Manage vendors, custodians and digital handovers.',
    permission: 'vendors:read',
  },
  {
    path: '/disk-logistics',
    label: 'Disk Logistics',
    icon: 'disk',
    description: 'Track disk and media movement across the network.',
    permission: 'disk:read',
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: 'reports',
    description: 'Operational dashboards and exportable reports.',
    permission: 'reports:read',
  },
  {
    path: '/users',
    label: 'User Management',
    icon: 'users',
    description: 'Manage users, roles, permissions and organizations.',
    permission: ['users:read', 'roles:read', 'organizations:read'],
  },
  {
    path: '/claims',
    label: 'Insurance Claims',
    icon: 'alert',
    description: 'Report vehicle incidents and track insurance claims.',
    permission: 'claims:read',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: 'settings',
    description: 'Application configuration and preferences.',
    permission: 'settings:manage',
  },
];

/** Resolve a nav item's permission(s) to an array for `hasAnyPermission`. */
export function navPermissions(item: NavItem): string[] {
  if (!item.permission) return [];
  return Array.isArray(item.permission) ? item.permission : [item.permission];
}
