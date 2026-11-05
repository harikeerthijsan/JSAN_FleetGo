import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DataTable,
  Icon,
  PageTitle,
  StatusBadge,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { roleService } from '@/services/roleService';
import type { Permission, Role } from '@/types/auth';
import { AdminTabs } from '../components/AdminTabs';
import { RoleFormModal } from '../components/RoleFormModal';

export function RolesPage() {
  useDocumentTitle('Roles & Permissions');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('roles:manage');

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await roleService.list();
      setRoles(list);
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    roleService
      .listPermissions()
      .then((r) => {
        setPermissions(r.permissions);
        setGrouped(r.grouped);
      })
      .catch(() => undefined);
  }, []);

  const columns: Column<Role>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.displayName}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            <code>{r.name}</code>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) =>
        r.isSystem ? (
          <StatusBadge tone="info">System</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Custom</StatusBadge>
        ),
    },
    { key: 'perms', header: 'Permissions', render: (r) => r.permissionKeys.length },
    { key: 'users', header: 'Users', render: (r) => r.userCount ?? 0 },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canManage ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(r);
              setModalOpen(true);
            }}
          >
            Edit permissions
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageTitle
        title="Roles & Permissions"
        description="Configure roles and the permissions they grant. Roles are enforced on every backend API."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Roles & Permissions' }]}
        actions={
          canManage ? (
            <Button
              leftIcon={<Icon name="users" size={16} />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Create role
            </Button>
          ) : undefined
        }
      />
      <AdminTabs />

      {notice ? (
        <div
          className="fg-auth__notice"
          style={{ marginBottom: 'var(--space-4)', cursor: 'pointer' }}
          onClick={() => setNotice(null)}
        >
          {notice}
        </div>
      ) : null}

      <Card flush>
        <DataTable
          columns={columns}
          rows={roles}
          rowKey={(r) => r.id}
          loading={loading}
          emptyTitle="No roles"
          emptyDescription={error ?? undefined}
        />
      </Card>

      <RoleFormModal
        open={modalOpen}
        role={editing}
        permissions={permissions}
        grouped={grouped}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => {
          setNotice(msg);
          void load();
        }}
      />
    </div>
  );
}
