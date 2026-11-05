import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Icon, PageTitle, Spinner, type IconName } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  masterDataService,
  type MasterResource,
} from '@/services/masterDataService';
import { MasterDataTabs } from '../components/MasterDataTabs';
import './MasterDataDashboard.css';

interface Tile {
  resource: MasterResource;
  label: string;
  icon: IconName;
  to: string;
}

const TILES: Tile[] = [
  { resource: 'makes', label: 'Makes', icon: 'fleet', to: '/master-data/makes-models' },
  { resource: 'models', label: 'Models', icon: 'fleet', to: '/master-data/makes-models' },
  { resource: 'types', label: 'Types', icon: 'inventory', to: '/master-data/types-categories' },
  { resource: 'categories', label: 'Categories', icon: 'inventory', to: '/master-data/types-categories' },
  { resource: 'fuel-types', label: 'Fuel Types', icon: 'dispatch', to: '/master-data/lookups' },
  { resource: 'ownership-types', label: 'Ownership Types', icon: 'tickets', to: '/master-data/lookups' },
  { resource: 'document-types', label: 'Document Types', icon: 'tickets', to: '/master-data/lookups' },
  { resource: 'depots', label: 'Depots', icon: 'vendors', to: '/master-data/depots' },
];

export function MasterDataDashboardPage() {
  useDocumentTitle('Master Data');
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      TILES.map((t) =>
        masterDataService
          .list(t.resource, { pageSize: 1 })
          .then((r) => [t.resource, r.meta.total] as const)
          .catch(() => [t.resource, 0] as const),
      ),
    )
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageTitle
        title="Master Data"
        description="Reference data that powers the fleet: makes, models, types, categories, fuel/ownership/document types and depots."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Master Data' }]}
      />
      <MasterDataTabs />

      {loading ? (
        <Spinner block label="Loading master data…" />
      ) : (
        <div className="fg-md-grid">
          {TILES.map((t) => (
            <Card key={t.resource} className="fg-md-tile" onClick={() => navigate(t.to)}>
              <span className="fg-md-tile__icon"><Icon name={t.icon} size={22} /></span>
              <span className="fg-md-tile__count">{counts[t.resource] ?? 0}</span>
              <span className="fg-md-tile__label">{t.label}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
