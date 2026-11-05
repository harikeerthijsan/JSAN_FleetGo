import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DataTable,
  Icon,
  Pagination,
  PageTitle,
  SearchBar,
  StatusBadge,
  type BadgeTone,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { organizationService } from '@/services/organizationService';
import type { Organization } from '@/types/auth';
import { AdminTabs } from '../components/AdminTabs';
import { OrgFormModal } from '../components/OrgFormModal';

const typeLabel: Record<string, string> = {
  CTS: 'CTS',
  JSAN: 'JSAN',
  VEHICLE_VENDOR: 'Vehicle Vendor',
  TRANSPORT_PARTNER: 'Transport Partner',
};

export function OrganizationsPage() {
  useDocumentTitle('Organizations');
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('organizations:create');
  const canUpdate = hasPermission('organizations:update');

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const pageSize = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organizationService.list({
        page,
        pageSize,
        search: search || undefined,
      });
      setOrgs(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<Organization>[] = [
    { key: 'name', header: 'Organization', render: (o) => <strong>{o.name}</strong> },
    { key: 'type', header: 'Type', render: (o) => typeLabel[o.type] ?? o.type },
    {
      key: 'contact',
      header: 'Contact',
      render: (o) => o.contactEmail ?? o.contactName ?? '—',
    },
    { key: 'users', header: 'Users', render: (o) => o._count?.users ?? 0 },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <StatusBadge tone={(o.status === 'ACTIVE' ? 'success' : 'danger') as BadgeTone}>
          {o.status}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (o) =>
        canUpdate ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(o);
              setModalOpen(true);
            }}
          >
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageTitle
        title="Organizations"
        description="CTS, JSAN, vehicle vendors and transport partners. Vendor users are scoped to their organization."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Organizations' }]}
        actions={
          canCreate ? (
            <Button
              leftIcon={<Icon name="vendors" size={16} />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Create organization
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
        <div style={{ padding: 'var(--space-4)' }}>
          <SearchBar
            placeholder="Search organizations…"
            value={search}
            onValueChange={(v) => {
              setPage(1);
              setSearch(v);
            }}
          />
        </div>
        <DataTable
          columns={columns}
          rows={orgs}
          rowKey={(o) => o.id}
          loading={loading}
          emptyTitle="No organizations"
          emptyDescription={error ?? undefined}
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>

      <OrgFormModal
        open={modalOpen}
        org={editing}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => {
          setNotice(msg);
          void load();
        }}
      />
    </div>
  );
}
