import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Button,
  Card,
  DonutChart,
  ErrorState,
  Icon,
  PageTitle,
  Spinner,
  type ChartDatum,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { fleetService } from '@/services/fleetService';
import type { FleetStats, VehicleStatus } from '@/types/vehicle';
import { statusLabel, STATUS_COLORS } from '../statusMeta';
import { FleetTabs } from '../components/FleetTabs';
import { CarPhotoCollection } from '@/components/CarPhotoCollection/CarPhotoCollection';
import './FleetOverviewPage.css';

function countFor(stats: FleetStats, status: VehicleStatus): number {
  return stats.byStatus.find((s) => s.status === status)?.count ?? 0;
}

export function FleetOverviewPage() {
  useDocumentTitle('Fleet Overview');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fleetService
      .stats()
      .then(setStats)
      .catch((e) => setError((e as NormalizedApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
        { label: 'Total Registered', value: stats.total, tone: 'primary' },
        { label: 'Available', value: countFor(stats, 'AVAILABLE'), tone: 'success' },
        { label: 'Allocated', value: countFor(stats, 'ALLOCATED'), tone: 'info' },
        { label: 'Under Maintenance', value: countFor(stats, 'UNDER_MAINTENANCE'), tone: 'warning' },
        { label: 'Damaged', value: countFor(stats, 'DAMAGED'), tone: 'danger' },
        { label: 'Inactive', value: countFor(stats, 'INACTIVE'), tone: 'neutral' },
      ]
    : [];

  const statusChart: ChartDatum[] = stats
    ? stats.byStatus
        .filter((s) => s.count > 0)
        .map((s) => ({ label: statusLabel(s.status), count: s.count, color: STATUS_COLORS[s.status] }))
    : [];

  return (
    <div>
      <PageTitle
        title="Fleet Management"
        description="Overview of the vehicle fleet and its current distribution."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Fleet' }]}
        actions={
          hasPermission('fleet:manage') ? (
            <Button
              leftIcon={<Icon name="fleet" size={16} />}
              onClick={() => navigate('/fleet/vehicles/new')}
            >
              Register vehicle
            </Button>
          ) : undefined
        }
      />
      <FleetTabs />

      {loading ? (
        <Spinner block label="Loading fleet statistics…" />
      ) : error ? (
        <Card>
          <ErrorState title="Could not load fleet statistics" description={error} />
        </Card>
      ) : stats ? (
        <>
          <div className="fg-fleet-cards">
            {cards.map((c) => (
              <Card key={c.label} className={`fg-stat fg-stat--${c.tone}`}>
                <span className="fg-stat__value">{c.value}</span>
                <span className="fg-stat__label">{c.label}</span>
              </Card>
            ))}
          </div>

          <div className="fg-fleet-charts">
            <Card title="Vehicles by status">
              <DonutChart data={statusChart} />
            </Card>
            <Card title="Vehicles by type">
              <BarChart data={stats.byType} />
            </Card>
            <Card title="Vehicles by location">
              <BarChart data={stats.byLocation} />
            </Card>
          </div>
        </>
      ) : null}
      <CarPhotoCollection />
    </div>
  );
}
