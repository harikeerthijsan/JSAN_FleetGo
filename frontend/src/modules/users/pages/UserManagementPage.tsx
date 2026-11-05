import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Icon,
  Pagination,
  PageTitle,
  SearchBar,
  Select,
  StatusBadge,
  type BadgeTone,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { organizationService } from '@/services/organizationService';
import { roleService } from '@/services/roleService';
import { userService } from '@/services/userService';
import type { ManagedUser, Organization, Role, UserStatus } from '@/types/auth';
import { AdminTabs } from '../components/AdminTabs';
import { UserFormModal } from '../components/UserFormModal';

const statusTone: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'danger',
  PENDING: 'warning',
};

export function UserManagementPage() {
  useDocumentTitle('User Management');
  const { hasPermission } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = hasPermission('users:create');
  const canUpdate = hasPermission('users:update');
  const canStatus = hasPermission('users:status');
  const canReset = hasPermission('users:reset_password');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await userService.list({
        page,
        pageSize,
        search: search || undefined,
        roleId: roleFilter || undefined,
        status: (statusFilter || undefined) as UserStatus | undefined,
      });
      setUsers(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Reference data for filters/forms.
  useEffect(() => {
    roleService.list().then(setRoles).catch(() => undefined);
    organizationService
      .list({ pageSize: 100 })
      .then((r) => setOrgs(r.data))
      .catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (user: ManagedUser) => {
    setEditing(user);
    setModalOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setBusy(true);
    try {
      const next: UserStatus =
        statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await userService.setStatus(statusTarget.id, next);
      setNotice(
        `${statusTarget.fullName} is now ${next === 'ACTIVE' ? 'active' : 'inactive'}.`,
      );
      setStatusTarget(null);
      void loadUsers();
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Status change failed');
      setStatusTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (user: ManagedUser) => {
    try {
      const res = await userService.resetPassword(user.id);
      setNotice(
        res.devToken
          ? `Reset token for ${user.email}: ${res.devToken}`
          : `Password reset issued for ${user.email}.`,
      );
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Reset failed');
    }
  };

  const columns: Column<ManagedUser>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div>
          <div style={{ fontWeight: 600 }}>{u.fullName}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {u.email}
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => u.role.displayName },
    {
      key: 'org',
      header: 'Organization',
      render: (u) => u.organization?.name ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <StatusBadge tone={statusTone[u.status]}>{u.status}</StatusBadge>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (u) =>
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          {canUpdate ? (
            <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
              Edit
            </Button>
          ) : null}
          {canReset ? (
            <Button variant="ghost" size="sm" onClick={() => resetPassword(u)}>
              Reset PW
            </Button>
          ) : null}
          {canStatus ? (
            <Button
              variant={u.status === 'ACTIVE' ? 'ghost' : 'secondary'}
              size="sm"
              onClick={() => setStatusTarget(u)}
            >
              {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageTitle
        title="User Management"
        description="Manage users, roles, permissions and organizations."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'User Management' }]}
        actions={
          canCreate ? (
            <Button leftIcon={<Icon name="users" size={16} />} onClick={openCreate}>
              Create user
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
          title="Click to dismiss"
        >
          {notice}
        </div>
      ) : null}

      <Card flush>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <SearchBar
            placeholder="Search name or email…"
            value={search}
            onValueChange={(v) => {
              setPage(1);
              setSearch(v);
            }}
          />
          <div style={{ width: 200 }}>
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => {
                setPage(1);
                setRoleFilter(e.target.value);
              }}
              options={[
                { label: 'All roles', value: '' },
                ...roles.map((r) => ({ label: r.displayName, value: r.id })),
              ]}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              options={[
                { label: 'All statuses', value: '' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Inactive', value: 'INACTIVE' },
                { label: 'Pending', value: 'PENDING' },
              ]}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={users}
          rowKey={(u) => u.id}
          loading={loading}
          emptyTitle="No users found"
          emptyDescription={error ?? 'Try adjusting your search or filters.'}
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      </Card>

      <UserFormModal
        open={modalOpen}
        user={editing}
        roles={roles}
        organizations={orgs}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => {
          setNotice(msg);
          void loadUsers();
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.status === 'ACTIVE' ? 'Deactivate user' : 'Activate user'
        }
        message={
          statusTarget?.status === 'ACTIVE'
            ? `Deactivate ${statusTarget?.fullName}? They will be signed out and unable to log in.`
            : `Activate ${statusTarget?.fullName}? They will regain access.`
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        destructive={statusTarget?.status === 'ACTIVE'}
        loading={busy}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
}
