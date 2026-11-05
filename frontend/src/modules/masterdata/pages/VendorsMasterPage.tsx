import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageTitle,
  SearchBar,
  StatusBadge,
  type BadgeTone,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { organizationService } from '@/services/organizationService';
import type { Organization } from '@/types/auth';
import { OrgFormModal } from '@/modules/users/components/OrgFormModal';
import { MasterDataTabs } from '../components/MasterDataTabs';

const typeLabel: Record<string, string> = {
  VEHICLE_VENDOR: 'Vehicle Vendor',
  TRANSPORT_PARTNER: 'Transport Partner',
};

/**
 * Vendors & transport partners are REUSED from the Phase 2 Organization model
 * (no duplicate vendor entity). This screen simply filters organizations to the
 * vendor/transport types.
 */
export function VendorsMasterPage() {
  useDocumentTitle('Vendors & Partners');
  const { hasPermission } = useAuth();
  const canRead = hasPermission('organizations:read');
  const canCreate = hasPermission('organizations:create');
  const canUpdate = hasPermission('organizations:update');

  const [rows, setRows] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) { setLoading(false); return; }
    setLoading(true);
    try {
      // Fetch both vendor-type orgs; filter client-side for the simple search.
      const [vendors, transport] = await Promise.all([
        organizationService.list({ type: 'VEHICLE_VENDOR', pageSize: 200, search: search || undefined }),
        organizationService.list({ type: 'TRANSPORT_PARTNER', pageSize: 200, search: search || undefined }),
      ]);
      setRows([...vendors.data, ...transport.data]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canRead, search]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Organization>[] = [
    { key: 'name', header: 'Organization', render: (o) => <strong>{o.name}</strong> },
    { key: 'type', header: 'Type', render: (o) => typeLabel[o.type] ?? o.type },
    { key: 'contact', header: 'Contact', render: (o) => o.contactEmail ?? o.contactName ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (o) => <StatusBadge tone={(o.status === 'ACTIVE' ? 'success' : 'danger') as BadgeTone}>{o.status}</StatusBadge>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (o) => canUpdate ? (
        <Button variant="ghost" size="sm" onClick={() => { setEditing(o); setModalOpen(true); }}>Edit</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Vehicle vendors and transport partners (shared with Organizations)."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
        actions={canCreate ? (
          <Button leftIcon={<Icon name="vendors" size={16} />} onClick={() => { setEditing(null); setModalOpen(true); }}>
            Add organization
          </Button>
        ) : undefined}
      />
      <MasterDataTabs />

      {!canRead ? (
        <Card>
          <EmptyState icon="alert" title="Organization access required"
            description="Viewing vendors and transport partners requires the organizations:read permission." />
        </Card>
      ) : (
        <Card flush>
          <div style={{ padding: 'var(--space-4)' }}>
            <SearchBar placeholder="Search vendors & partners…" value={search} onValueChange={setSearch} />
          </div>
          {notice ? (
            <div className="fg-auth__notice" style={{ margin: '0 var(--space-4) var(--space-3)', cursor: 'pointer' }} onClick={() => setNotice(null)}>{notice}</div>
          ) : null}
          <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} loading={loading}
            emptyTitle="No vendors or transport partners" />
        </Card>
      )}

      <OrgFormModal
        open={modalOpen}
        org={editing}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => { setNotice(msg); void load(); }}
      />
    </div>
  );
}
