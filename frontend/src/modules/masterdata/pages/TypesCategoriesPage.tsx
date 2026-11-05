import { useCallback, useEffect, useState } from 'react';
import { PageTitle, type Column } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { masterDataService } from '@/services/masterDataService';
import type { MasterRecord } from '@/types/vehicle';
import { LookupManager } from '../components/LookupManager';
import { MasterDataTabs } from '../components/MasterDataTabs';

export function TypesCategoriesPage() {
  useDocumentTitle('Types & Categories');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masterdata:manage');

  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [reload, setReload] = useState(0);

  const loadCategories = useCallback(() => {
    masterDataService.list('categories', { pageSize: 200 })
      .then((r) => setCategoryOptions(r.data.map((c) => ({ label: c.name, value: c.id }))))
      .catch(() => undefined);
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const categoryColumns: Column<MasterRecord>[] = [
    { key: 'name', header: 'Category', render: (r) => <strong>{r.name}</strong> },
  ];
  const typeColumns: Column<MasterRecord>[] = [
    { key: 'name', header: 'Type', render: (r) => <strong>{r.name}</strong> },
    { key: 'category', header: 'Category', render: (r) => r.category?.name ?? '—' },
  ];

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Manage vehicle categories and types."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
      />
      <MasterDataTabs />

      <LookupManager
        resource="categories"
        title="Vehicle Categories"
        singular="Category"
        statusField="isActive"
        canManage={canManage}
        columns={categoryColumns}
        fields={[{ name: 'name', label: 'Name', required: true }]}
        onChanged={() => { loadCategories(); setReload((n) => n + 1); }}
      />

      <div style={{ marginTop: 'var(--space-6)' }}>
        <LookupManager
          resource="types"
          title="Vehicle Types"
          singular="Type"
          statusField="isActive"
          canManage={canManage}
          reloadKey={reload}
          columns={typeColumns}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'categoryId', label: 'Category', type: 'select', options: categoryOptions, placeholder: 'Unassigned' },
          ]}
        />
      </div>
    </div>
  );
}
