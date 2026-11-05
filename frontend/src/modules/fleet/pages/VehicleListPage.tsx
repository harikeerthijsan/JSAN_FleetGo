import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Icon,
  Pagination,
  PageTitle,
  SearchBar,
  Select,
  StatusBadge,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { fleetService } from '@/services/fleetService';
import { masterDataService } from '@/services/masterDataService';
import type { MasterRecord, Vehicle, VehicleStatus } from '@/types/vehicle';
import { VEHICLE_STATUSES } from '@/types/vehicle';
import { STATUS_META } from '../statusMeta';
import { FleetTabs } from '../components/FleetTabs';

function toCsv(rows: Vehicle[]): string {
  const headers = [
    'Vehicle ID', 'Registration', 'VIN', 'Make', 'Model', 'Type',
    'Location', 'Organization', 'Status', 'Updated',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((v) =>
    [
      v.vehicleCode, v.registrationNumber, v.vin ?? '',
      v.make?.name ?? '', v.model?.name ?? '', v.type?.name ?? '',
      v.depot?.name ?? '', v.organization?.name ?? '', v.status,
      new Date(v.updatedAt).toISOString(),
    ].map(esc).join(','),
  );
  return [headers.map(esc).join(','), ...lines].join('\r\n');
}

export function VehicleListPage() {
  useDocumentTitle('Vehicles');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet:manage');

  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => VEHICLE_STATUSES.includes(searchParams.get('status') as VehicleStatus) ? searchParams.get('status')! : '');
  const [typeId, setTypeId] = useState('');
  const [makeId, setMakeId] = useState('');
  const [depotId, setDepotId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(searchParams.get('status') === 'INACTIVE');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [types, setTypes] = useState<MasterRecord[]>([]);
  const [makes, setMakes] = useState<MasterRecord[]>([]);
  const [depots, setDepots] = useState<MasterRecord[]>([]);
  const [toDeactivate, setToDeactivate] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fleetService.list({
        page, pageSize,
        search: search || undefined,
        status: (status || undefined) as VehicleStatus | undefined,
        typeId: typeId || undefined,
        makeId: makeId || undefined,
        depotId: depotId || undefined,
        includeInactive: includeInactive || undefined,
        sortBy, sortDir,
      });
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, typeId, makeId, depotId, includeInactive, sortBy, sortDir]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    masterDataService.list('types', { pageSize: 200, active: 'true' }).then((r) => setTypes(r.data)).catch(() => undefined);
    masterDataService.list('makes', { pageSize: 200, active: 'true' }).then((r) => setMakes(r.data)).catch(() => undefined);
    masterDataService.list('depots', { pageSize: 200 }).then((r) => setDepots(r.data)).catch(() => undefined);
  }, []);

  const exportCsv = async () => {
    setExporting(true);
    try {
      setNotice('');
      const exported: Vehicle[] = [];
      let exportPage = 1;
      let exportTotal = 0;
      do {
        const res = await fleetService.list({
          page: exportPage, pageSize: 200,
          search: search || undefined, status: (status || undefined) as VehicleStatus | undefined,
          typeId: typeId || undefined, makeId: makeId || undefined, depotId: depotId || undefined,
          includeInactive: includeInactive || undefined, sortBy, sortDir,
        });
        exportTotal = res.meta.total;
        if (!res.data.length && exported.length < exportTotal) throw new Error('The fleet changed during export. Please try again.');
        exported.push(...res.data);
        exportPage += 1;
      } while (exported.length < exportTotal);
      const unique = Array.from(new Map(exported.map((vehicle) => [vehicle.id, vehicle])).values());
      if (unique.length !== exportTotal) throw new Error('The fleet changed during export. Please try again.');
      const blob = new Blob([toCsv(unique)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fleetgo-vehicles-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${unique.length} matching vehicles.`);
    } catch (err) {
      setError((err as Error).message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    try {
      await fleetService.deactivate(toDeactivate.id);
      setToDeactivate(null);
      void load();
    } catch (e) {
      setError((e as NormalizedApiError).message);
      setToDeactivate(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Vehicle>[] = [
    {
      key: 'code', header: 'Vehicle ID',
      render: (v) => <Link to={`/fleet/vehicles/${v.id}`}><strong>{v.vehicleCode}</strong></Link>,
    },
    { key: 'reg', header: 'Registration', render: (v) => v.registrationNumber },
    {
      key: 'makeModel', header: 'Make / Model',
      render: (v) => [v.make?.name, v.model?.name].filter(Boolean).join(' ') || '—',
    },
    { key: 'type', header: 'Type', render: (v) => v.type?.name ?? '—' },
    { key: 'location', header: 'Location', render: (v) => v.depot?.name ?? '—' },
    { key: 'org', header: 'Organization', render: (v) => v.organization?.name ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (v) => (
        <StatusBadge tone={STATUS_META[v.status].tone}>
          {STATUS_META[v.status].label}
        </StatusBadge>
      ),
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (v) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/fleet/vehicles/${v.id}`)}>
            View
          </Button>
          {canManage ? (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/fleet/vehicles/${v.id}/edit`)}>
              Edit
            </Button>
          ) : null}
          {canManage && v.isActive ? (
            <Button variant="ghost" size="sm" onClick={() => setToDeactivate(v)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageTitle
        title="Vehicles"
        description="Search, filter and manage the vehicle fleet."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Fleet', to: '/fleet' }, { label: 'Vehicles' }]}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" loading={exporting} onClick={exportCsv}
              leftIcon={<Icon name="reports" size={16} />}>
              Export CSV
            </Button>
            {canManage ? (
              <Button leftIcon={<Icon name="fleet" size={16} />} onClick={() => navigate('/fleet/vehicles/new')}>
                Register vehicle
              </Button>
            ) : null}
          </div>
        }
      />
      <FleetTabs />

      {error ? <div role="alert"><ErrorState title="The request could not be completed" description={error}
        action={<Button variant="secondary" onClick={load}>Retry loading vehicles</Button>} /></div> : null}
      {notice ? <p className="fg-feedback" role="status">{notice}</p> : null}
      <Card flush>
        <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar placeholder="Search ID, registration or VIN…" value={search}
            onValueChange={(v) => { setPage(1); setSearch(v); }} />
          <div style={{ width: 170 }}>
            <Select aria-label="Status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}
              options={[{ label: 'All statuses', value: '' }, ...VEHICLE_STATUSES.map((s) => ({ label: STATUS_META[s].label, value: s }))]} />
          </div>
          <div style={{ width: 150 }}>
            <Select aria-label="Type" value={typeId} onChange={(e) => { setPage(1); setTypeId(e.target.value); }}
              options={[{ label: 'All types', value: '' }, ...types.map((t) => ({ label: t.name, value: t.id }))]} />
          </div>
          <div style={{ width: 150 }}>
            <Select aria-label="Make" value={makeId} onChange={(e) => { setPage(1); setMakeId(e.target.value); }}
              options={[{ label: 'All makes', value: '' }, ...makes.map((m) => ({ label: m.name, value: m.id }))]} />
          </div>
          <div style={{ width: 160 }}>
            <Select aria-label="Location" value={depotId} onChange={(e) => { setPage(1); setDepotId(e.target.value); }}
              options={[{ label: 'All locations', value: '' }, ...depots.map((d) => ({ label: d.name, value: d.id }))]} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
            <input type="checkbox" checked={includeInactive} onChange={(e) => { setPage(1); setIncludeInactive(e.target.checked); }} />
            Include inactive
          </label>
          <div style={{ width: 170, marginLeft: 'auto' }}>
            <Select aria-label="Sort by"
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => { const [b, d] = e.target.value.split(':'); setPage(1); setSortBy(b); setSortDir(d as 'asc' | 'desc'); }}
              options={[
                { label: 'Newest first', value: 'createdAt:desc' },
                { label: 'Oldest first', value: 'createdAt:asc' },
                { label: 'Registration A–Z', value: 'registrationNumber:asc' },
                { label: 'Vehicle ID', value: 'vehicleCode:asc' },
                { label: 'Status', value: 'status:asc' },
              ]} />
          </div>
        </div>

        {(search || status || typeId || makeId || depotId || includeInactive) ? <div className="fg-filter-summary">
          <span>{total} matching vehicles</span>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setTypeId(''); setMakeId(''); setDepotId(''); setIncludeInactive(false); setPage(1); }}>Clear all filters</Button>
        </div> : null}
        {error && rows.length === 0 ? null : <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          loading={loading}
          emptyTitle={search || status || typeId || makeId || depotId || includeInactive ? 'No matching vehicles' : 'Your fleet is ready for its first vehicle'}
          emptyDescription={search || status || typeId || makeId || depotId || includeInactive ? 'Clear or adjust your filters to see more vehicles.' : canManage ? 'Choose Register vehicle to add your first vehicle.' : 'Registered vehicles will appear here.'}
          onRowClick={(v) => navigate(`/fleet/vehicles/${v.id}`)}
        />}
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>

      <ConfirmDialog
        open={Boolean(toDeactivate)}
        title="Deactivate vehicle"
        message={`Deactivate ${toDeactivate?.vehicleCode} (${toDeactivate?.registrationNumber})? The record is preserved but marked inactive.`}
        confirmLabel="Deactivate"
        destructive
        loading={busy}
        onConfirm={confirmDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
