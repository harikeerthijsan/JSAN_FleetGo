import { useCallback, useEffect, useState } from 'react';
import { PageTitle, type Column } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { masterDataService } from '@/services/masterDataService';
import type { MasterRecord } from '@/types/vehicle';
import { LookupManager } from '../components/LookupManager';
import { MasterDataTabs } from '../components/MasterDataTabs';

export function MakesModelsPage() {
  useDocumentTitle('Makes & Models');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masterdata:manage');

  const [makeOptions, setMakeOptions] = useState<{ label: string; value: string }[]>([]);
  const [reload, setReload] = useState(0);

  const loadMakes = useCallback(() => {
    masterDataService.list('makes', { pageSize: 200 })
      .then((r) => setMakeOptions(r.data.map((m) => ({ label: m.name, value: m.id }))))
      .catch(() => undefined);
  }, []);

  useEffect(() => { loadMakes(); }, [loadMakes]);

  const makeColumns: Column<MasterRecord>[] = [
    { key: 'name', header: 'Make', render: (r) => <strong>{r.name}</strong> },
  ];
  const modelColumns: Column<MasterRecord>[] = [
    { key: 'name', header: 'Model', render: (r) => <strong>{r.name}</strong> },
    { key: 'variant', header: 'Variant', render: (r) => r.variant || '—' },
    { key: 'make', header: 'Make', render: (r) => r.make?.name ?? '—' },
  ];

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Manage vehicle makes/manufacturers and their models."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
      />
      <MasterDataTabs />

      <LookupManager
        resource="makes"
        title="Makes & Manufacturers"
        singular="Make"
        statusField="isActive"
        canManage={canManage}
        columns={makeColumns}
        fields={[{ name: 'name', label: 'Name', required: true }]}
        onChanged={() => { loadMakes(); setReload((n) => n + 1); }}
      />

      <div style={{ marginTop: 'var(--space-6)' }}>
        <LookupManager
          resource="models"
          title="Models"
          singular="Model"
          statusField="isActive"
          canManage={canManage}
          reloadKey={reload}
          columns={modelColumns}
          fields={[
            { name: 'name', label: 'Model name', required: true },
            { name: 'variant', label: 'Variant' },
            { name: 'makeId', label: 'Make', type: 'select', required: true, options: makeOptions, placeholder: 'Select a make' },
          ]}
        />
      </div>
    </div>
  );
}
