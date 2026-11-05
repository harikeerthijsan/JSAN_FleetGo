import { PageTitle, type Column } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { MasterRecord } from '@/types/vehicle';
import { LookupManager } from '../components/LookupManager';
import { MasterDataTabs } from '../components/MasterDataTabs';

export function DepotsPage() {
  useDocumentTitle('Depots & Locations');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masterdata:manage');

  const columns: Column<MasterRecord>[] = [
    { key: 'name', header: 'Depot', render: (r) => <strong>{r.name}</strong> },
    { key: 'code', header: 'Code', render: (r) => r.code ?? '—' },
    { key: 'region', header: 'Region', render: (r) => r.region || '—' },
    { key: 'city', header: 'City', render: (r) => r.city || '—' },
  ];

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Manage depots and operating locations."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
      />
      <MasterDataTabs />

      <LookupManager
        resource="depots"
        title="Depots & Locations"
        singular="Depot"
        statusField="status"
        canManage={canManage}
        columns={columns}
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'code', label: 'Code', required: true },
          { name: 'region', label: 'Region' },
          { name: 'address', label: 'Address' },
          { name: 'city', label: 'City' },
          { name: 'state', label: 'State' },
          { name: 'country', label: 'Country' },
        ]}
      />
    </div>
  );
}
