import { PageTitle, type Column } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { MasterRecord } from '@/types/vehicle';
import { LookupManager } from '../components/LookupManager';
import { MasterDataTabs } from '../components/MasterDataTabs';

const nameColumn: Column<MasterRecord>[] = [
  { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
];

export function LookupsPage() {
  useDocumentTitle('Lookups');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masterdata:manage');

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Manage fuel types, ownership types and document types."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
      />
      <MasterDataTabs />

      <LookupManager
        resource="fuel-types"
        title="Fuel Types"
        singular="Fuel type"
        statusField="isActive"
        canManage={canManage}
        columns={nameColumn}
        fields={[{ name: 'name', label: 'Name', required: true }]}
      />

      <div style={{ marginTop: 'var(--space-6)' }}>
        <LookupManager
          resource="ownership-types"
          title="Ownership Types"
          singular="Ownership type"
          statusField="isActive"
          canManage={canManage}
          columns={nameColumn}
          fields={[{ name: 'name', label: 'Name', required: true }]}
        />
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <LookupManager
          resource="document-types"
          title="Document Types"
          singular="Document type"
          statusField="isActive"
          canManage={canManage}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
            { key: 'category', header: 'Category', render: (r) => String((r as unknown as Record<string, unknown>).category ?? '—') },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'category', label: 'Category', type: 'select', options: [
              { label: 'Registration', value: 'registration' },
              { label: 'Insurance', value: 'insurance' },
              { label: 'Photo', value: 'photo' },
              { label: 'Other', value: 'other' },
            ] },
          ]}
        />
      </div>
    </div>
  );
}
