/**
 * RBAC catalog — the single source of truth for FleetGo permissions and the
 * built-in (system) role → permission mappings.
 *
 * Permissions are configurable in the database (roles can be created/edited at
 * runtime), but this file defines the canonical catalog that the seed loads
 * and that system roles are initialized from. Permission keys follow the
 * `category:action` convention.
 */

export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // Dashboard
  { key: 'dashboard:view', category: 'dashboard', description: 'View the dashboard' },

  // User management
  { key: 'users:read', category: 'users', description: 'View users' },
  { key: 'users:create', category: 'users', description: 'Create users' },
  { key: 'users:update', category: 'users', description: 'Edit users' },
  { key: 'users:status', category: 'users', description: 'Activate/deactivate users' },
  { key: 'users:reset_password', category: 'users', description: 'Reset a user password' },

  // Roles & permissions
  { key: 'roles:read', category: 'roles', description: 'View roles' },
  { key: 'roles:manage', category: 'roles', description: 'Create and edit roles/permissions' },
  { key: 'permissions:read', category: 'permissions', description: 'View the permission catalog' },

  // Organizations
  { key: 'organizations:read', category: 'organizations', description: 'View organizations' },
  { key: 'organizations:create', category: 'organizations', description: 'Create organizations' },
  { key: 'organizations:update', category: 'organizations', description: 'Edit organizations' },

  // Business domains (read/manage gates used for navigation + future APIs)
  { key: 'fleet:read', category: 'fleet', description: 'View fleet' },
  { key: 'fleet:manage', category: 'fleet', description: 'Create, edit and manage vehicles' },
  { key: 'masterdata:read', category: 'masterdata', description: 'View master data' },
  { key: 'masterdata:manage', category: 'masterdata', description: 'Manage master data (makes, models, types, depots, etc.)' },
  { key: 'inventory:read', category: 'inventory', description: 'View inventory' },
  { key: 'inventory:reserve', category: 'inventory', description: 'Reserve and cancel scoped inventory vehicles' },
  { key: 'inventory:review', category: 'inventory', description: 'Review reconciliation and approve corrections' },
  { key: 'inventory:manage', category: 'inventory', description: 'Manage inventory' },
  { key: 'tickets:read', category: 'tickets', description: 'View tickets' },
  { key: 'tickets:create', category: 'tickets', description: 'Raise vehicle requests' },
  { key: 'tickets:approve', category: 'tickets', description: 'Approve/reject requests' },
  { key: 'tickets:manage', category: 'tickets', description: 'Assign, reassign, manage status and configure approval workflows/SLAs' },
  { key: 'allocation:manage', category: 'allocation', description: 'Allocate vehicles' },
  { key: 'trips:update', category: 'dispatch', description: 'Report milestones and exceptions on assigned trips' },
  { key: 'dispatch:read', category: 'dispatch', description: 'View dispatch & trips' },
  { key: 'dispatch:manage', category: 'dispatch', description: 'Manage dispatch & trips' },
  { key: 'tracking:manage', category: 'tracking', description: 'Manage scoped GPS devices, simulation, geofences and tracking alerts' },
  { key: 'tracking:read', category: 'tracking', description: 'View live tracking' },
  { key: 'inspections:read', category: 'inspections', description: 'View inspections' },
  { key: 'inspections:manage', category: 'inspections', description: 'Create and manage inspections, templates, discrepancies, handovers and PODs' },
  { key: 'inspections:review', category: 'inspections', description: 'Approve/reject inspections and confirm/resolve discrepancies' },
  { key: 'inspections:confirm', category: 'inspections', description: 'Confirm handover/receiving' },
  { key: 'vendors:read', category: 'vendors', description: 'View vendors' },
  { key: 'vendors:manage', category: 'vendors', description: 'Manage vendors' },
  { key: 'disk:read', category: 'disk-logistics', description: 'View disk logistics' },
  { key: 'disk:manage', category: 'disk-logistics', description: 'Manage disks, shipments, custody, inspections and reconciliation' },
  { key: 'disk:review', category: 'disk-logistics', description: 'Approve disk reconciliation and confirm serious disk discrepancies' },
  { key: 'reports:read', category: 'reports', description: 'View reports' },
  { key: 'settings:manage', category: 'settings', description: 'Manage system settings' },
  { key: 'audit:read', category: 'audit', description: 'View audit logs' },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export interface RoleDef {
  name: string;
  displayName: string;
  description: string;
  /** Use "*" to grant every permission. */
  permissions: string[] | '*';
}

export const SYSTEM_ROLES: RoleDef[] = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description: 'Complete application access and system configuration.',
    permissions: '*',
  },
  {
    name: 'JSAN_ADMIN',
    displayName: 'JSAN Admin',
    description: 'Manages day-to-day fleet, inventory and operations.',
    permissions: [
      'dashboard:view',
      'users:read',
      'users:create',
      'users:update',
      'users:status',
      'users:reset_password',
      'roles:read',
      'permissions:read',
      'organizations:read',
      'organizations:create',
      'organizations:update',
      'fleet:read',
      'fleet:manage',
      'masterdata:read',
      'masterdata:manage',
      'inventory:read',
      'inventory:manage',
      'inventory:reserve',
      'inventory:review',
      'tickets:read',
      'tickets:create',
      'tickets:approve',
      'tickets:manage',
      'allocation:manage',
      'dispatch:read',
      'dispatch:manage',
      'tracking:read',
      'tracking:manage',
      'inspections:read',
      'inspections:manage',
      'inspections:review',
      'inspections:confirm',
      'vendors:read',
      'vendors:manage',
      'disk:read',
      'disk:manage',
      'disk:review',
      'reports:read',
      'audit:read',
      'settings:manage',
    ],
  },
  {
    name: 'OPERATIONS_MANAGER',
    displayName: 'Operations Manager',
    description: 'Reviews requests, allocates vehicles and manages dispatch.',
    permissions: [
      'dashboard:view',
      'fleet:read',
      'fleet:manage',
      'masterdata:read',
      'inventory:read',
      'inventory:manage',
      'inventory:reserve',
      'tickets:read',
      'tickets:create',
      'tickets:approve',
      'tickets:manage',
      'allocation:manage',
      'dispatch:read',
      'dispatch:manage',
      'tracking:read',
      'tracking:manage',
      'inspections:read',
      'inspections:manage',
      'vendors:read',
      'disk:read',
      'disk:manage',
      'reports:read',
    ],
  },
  {
    name: 'CTS_USER',
    displayName: 'CTS User',
    description: 'Raises vehicle requests and tracks their status.',
    permissions: [
      'dashboard:view',
      'fleet:read',
      'inventory:read',
      'dispatch:read',
      'tickets:read',
      'tickets:create',
      'tracking:read',
      'inspections:read',
      'inspections:confirm',
      'disk:read',
      'reports:read',
    ],
  },
  {
    name: 'VENDOR_USER',
    displayName: 'Vendor User',
    description:
      'Vendor-scoped access to assigned vehicles, deliveries and inspections.',
    permissions: [
      'dashboard:view',
      'fleet:read',
      'inventory:read',
      'tickets:read',
      'tickets:create',
      'dispatch:read',
      'tracking:read',
      'inspections:read',
      'inspections:confirm',
      'disk:read',
      'vendors:read',
      'reports:read',
    ],
  },
  {
    name: 'TRANSPORTER_DRIVER',
    displayName: 'Transporter / Driver',
    description: 'Access to assigned trips and permitted trip milestones.',
    permissions: [
      'dashboard:view',
      'dispatch:read',
      'trips:update',
      'tracking:read',
      'inspections:confirm',
      'reports:read',
    ],
  },
];

/** Resolve a role definition's permission keys to a concrete list. */
export function resolveRolePermissions(role: RoleDef): string[] {
  return role.permissions === '*' ? ALL_PERMISSION_KEYS : role.permissions;
}
