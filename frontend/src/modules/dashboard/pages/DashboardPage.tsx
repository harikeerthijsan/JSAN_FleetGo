import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Button,
  Card,
  DonutChart,
  ErrorState,
  Icon,
  PageTitle,
  Spinner,
  StatusBadge,
  type BadgeTone,
  type ChartDatum,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useHealth } from '@/hooks/useHealth';
import { fleetService } from '@/services/fleetService';
import type { HealthCheck } from '@/types/api';
import type { FleetStats, VehicleStatus } from '@/types/vehicle';
import { statusLabel, STATUS_COLORS } from '@/modules/fleet/statusMeta';
import { OperationalOverview } from '@/modules/dashboard/OperationalOverview';
import { CarPhotoCollection } from '@/components/CarPhotoCollection/CarPhotoCollection';
import './DashboardPage.css';

function appTone(status?: HealthCheck['status']): BadgeTone {
  if (status === 'ok') return 'success';
  if (status === 'degraded') return 'warning';
  return 'danger';
}
function dbTone(status?: HealthCheck['database']['status']): BadgeTone {
  return status === 'connected' ? 'success' : 'danger';
}
function countFor(stats: FleetStats, s: VehicleStatus): number {
  return stats.byStatus.find((x) => x.status === s)?.count ?? 0;
}

/**
 * Dashboard. The "System Status" card performs a live health check. For users
 * with fleet access it also renders real fleet summary cards and charts sourced
 * from GET /fleet/stats (no hardcoded numbers).
 */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { data, loading, error, refetch } = useHealth();

  const canFleet = hasPermission('fleet:read');
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(canFleet);

  const [statsError, setStatsError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const loadStats = useCallback(async () => {
    if (!canFleet) return;
    setStatsLoading(true); setStatsError(null);
    try { setStats(await fleetService.stats()); setUpdatedAt(new Date()); }
    catch (err) { setStatsError((err as { message?: string }).message ?? 'Unable to load fleet statistics.'); }
    finally { setStatsLoading(false); }
  }, [canFleet]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  const refreshAll = () => { refetch(); void loadStats(); };

  const fleetCards = stats
    ? [
        { label: 'Total Registered', value: stats.total, tone: 'primary', status: '' },
        { label: 'Available', value: countFor(stats, 'AVAILABLE'), tone: 'success', status: 'AVAILABLE' },
        { label: 'Allocated', value: countFor(stats, 'ALLOCATED'), tone: 'info', status: 'ALLOCATED' },
        { label: 'Under Maintenance', value: countFor(stats, 'UNDER_MAINTENANCE'), tone: 'warning', status: 'UNDER_MAINTENANCE' },
        { label: 'Damaged', value: countFor(stats, 'DAMAGED'), tone: 'danger', status: 'DAMAGED' },
        { label: 'Inactive', value: countFor(stats, 'INACTIVE'), tone: 'neutral', status: 'INACTIVE' },
      ]
    : [];

  const chartColors = ['#285a60', '#58a58c', '#d7af67', '#91aaa5', '#9189af', '#b27670'];
  const statusChart: ChartDatum[] = stats
    ? stats.byStatus.filter((s) => s.count > 0).map((s) => ({ label: statusLabel(s.status), count: s.count, color: STATUS_COLORS[s.status] }))
    : [];

  return (
    <div className="fg-dash">
      <PageTitle
        title="Operations overview"
        description="A clear view of your fleet. A confident start to your day."
        breadcrumbs={[{ label: 'FleetGo' }, { label: 'Dashboard' }]}
        actions={
          <Button variant="secondary" onClick={refreshAll} loading={loading || statsLoading} leftIcon={<Icon name="dashboard" size={16} />}>
            Refresh
          </Button>
        }
      />

      <OperationalOverview />

      <div className="fg-dash__section-label"><span>{canFleet ? 'FLEET AT A GLANCE' : 'YOUR WORKSPACE'}</span>
        <span role="status">{statsLoading ? 'Updating fleet?' : canFleet && updatedAt ? `Fleet updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Welcome to FleetGo'}</span>
      </div>
      {statsError ? <div role="alert"><ErrorState title="Fleet summary could not be refreshed" description={`${statsError}${stats ? ' Showing the last successful snapshot.' : ''}`}
        action={<Button variant="secondary" onClick={loadStats} loading={statsLoading}>Retry fleet summary</Button>} /></div> : null}
      {canFleet && stats && stats.total > 0 ? <section className="fg-dash__attention" aria-label="Fleet attention summary">
        <Icon name="alert" size={22} />
        <div><h2>What needs attention</h2><p>{countFor(stats, 'UNDER_MAINTENANCE')} under maintenance ? {countFor(stats, 'DAMAGED')} damaged ? {countFor(stats, 'AVAILABLE')} available for allocation</p></div>
        <Link to="/fleet/vehicles">Review vehicles <Icon name="chevron-right" size={16} /></Link>
      </section> : null}
      {canFleet && stats && stats.total === 0 ? <Card title="Start building your fleet" subtitle="Your operational summary will appear as vehicles are registered.">
        {hasPermission('fleet:manage') ? <Link to="/fleet/vehicles/new">Register your first vehicle</Link> : <p>Contact your fleet administrator to register vehicles.</p>}
      </Card> : null}

      {/* Fleet summary (real data) */}
      {canFleet ? (
        statsLoading && !stats ? (
          <Spinner block label="Loading fleet summary…" />
        ) : stats ? (
          <>
            <div className="fg-dash__fleet-cards">
              {fleetCards.map((c) => (
                <Card
                  key={c.label}
                  className={`fg-stat fg-stat--${c.tone}`}
                  role="link"
                  tabIndex={0}
                  aria-label={`${c.label}: ${c.value}. View fleet`}
                  onKeyDown={(event) => { if (event.key === 'Enter') navigate(c.status ? `/fleet/vehicles?status=${c.status}` : '/fleet/vehicles'); }}
                  onClick={() => navigate(c.status ? `/fleet/vehicles?status=${c.status}` : '/fleet/vehicles')}
                >
                  <div className="fg-dash__stat-top"><span className="fg-dash__stat-icon"><Icon name={c.tone === 'warning' ? 'settings' : c.tone === 'danger' ? 'alert' : 'fleet'} size={18} /></span><Icon name="chevron-right" size={14} /></div>
                  <span className="fg-stat__value">{c.value}</span>
                  <span className="fg-stat__label">{c.label}</span>
                </Card>
              ))}
            </div>
            <div className="fg-dash__charts">
              <Card title="Fleet composition" subtitle="How your vehicles are distributed today">
                <DonutChart data={statusChart} />
              </Card>
              <Card title="Vehicle mix" subtitle="Registered fleet by vehicle type">
                <BarChart data={stats.byType.map((item, i) => ({ ...item, color: chartColors[i % chartColors.length] }))} />
              </Card>
            </div>
          </>
        ) : null
      ) : null}

      <div className="fg-dash__columns">
        <details className="fg-dash__diagnostics">
          <summary>System diagnostics <span>{error ? 'Unavailable' : data?.status ?? 'Checking?'}</span></summary>
        <Card
          title="System Status"
          subtitle="Live health check against the FleetGo API"
          actions={data ? <StatusBadge tone={appTone(data.status)}>{data.status === 'ok' ? 'Healthy' : data.status === 'degraded' ? 'Degraded' : 'Down'}</StatusBadge> : null}
        >
          {loading ? (
            <Spinner block label="Checking system status…" />
          ) : error ? (
            <ErrorState title="Cannot reach the FleetGo API" description={error}
              action={<Button variant="primary" onClick={refetch}>Retry</Button>} />
          ) : data ? (
            <dl className="fg-status">
              <div className="fg-status__row"><dt>Application</dt><dd>{data.application}</dd></div>
              <div className="fg-status__row"><dt>Environment</dt><dd>{data.environment}</dd></div>
              <div className="fg-status__row"><dt>Version</dt><dd>{data.version}</dd></div>
              <div className="fg-status__row"><dt>API</dt><dd><StatusBadge tone={appTone(data.status)}>{data.status}</StatusBadge></dd></div>
              <div className="fg-status__row"><dt>Database</dt><dd><StatusBadge tone={dbTone(data.database.status)}>{data.database.status}</StatusBadge></dd></div>
              <div className="fg-status__row"><dt>Uptime</dt><dd>{data.uptimeSeconds}s</dd></div>
            </dl>
          ) : null}
        </Card>

        </details>

        <Card title="Your workspace" subtitle="Everything you need, one step away">
          <ul className="fg-checklist">
            {canFleet ? <li><Icon name="fleet" size={18} /> <Link to="/fleet">Fleet overview &amp; vehicles</Link></li> : null}
            {hasPermission('masterdata:read') ? <li><Icon name="settings" size={18} /> <Link to="/master-data">Master data</Link></li> : null}
            {hasPermission('users:read') ? <li><Icon name="users" size={18} /> <Link to="/users">User management</Link></li> : null}
            <li><Icon name="user-circle" size={18} /> <Link to="/profile">My profile</Link></li>
          </ul>
        </Card>
      </div>
      <CarPhotoCollection />
    </div>
  );
}
