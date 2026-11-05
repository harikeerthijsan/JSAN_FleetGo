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
import { ticketService } from '@/services/ticketService';
import type { TicketDashboard } from '@/types/ticket';
import { typeLabel } from '../ticketMeta';

export function TicketDashboardPage() {
  useDocumentTitle('Ticket Dashboard');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<TicketDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ticketService
      .dashboard()
      .then(setData)
      .catch((e) => setError((e as NormalizedApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const cards = data
    ? [
        { label: 'Total Tickets', value: data.cards.total, tone: 'primary' },
        { label: 'Pending Approval', value: data.cards.pendingApproval, tone: 'warning' },
        { label: 'Approved', value: data.cards.approved, tone: 'success' },
        { label: 'In Progress', value: data.cards.inProgress, tone: 'info' },
        { label: 'Overdue', value: data.cards.overdue, tone: 'danger' },
        { label: 'Completed', value: data.cards.completed, tone: 'success' },
        { label: 'Rejected', value: data.cards.rejected, tone: 'danger' },
      ]
    : [];

  const typeChart: ChartDatum[] = data
    ? data.byType.map((t) => ({ label: typeLabel(t.label as never), count: t.count }))
    : [];
  const statusChart: ChartDatum[] = data ? data.byStatus.map((s) => ({ label: s.label, count: s.count })) : [];
  const priorityChart: ChartDatum[] = data ? data.byPriority.map((p) => ({ label: p.label, count: p.count })) : [];
  const orgChart: ChartDatum[] = data ? data.byOrganization.map((o) => ({ label: o.label, count: o.count })) : [];

  return (
    <div>
      <PageTitle
        title="Ticketing & Approvals"
        description="Raise, track and approve fleet operation requests."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets' }]}
        actions={
          hasPermission('tickets:create') ? (
            <Button leftIcon={<Icon name="tickets" size={16} />} onClick={() => navigate('/tickets/new')}>
              Create ticket
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Spinner block label="Loading ticket dashboard…" />
      ) : error ? (
        <Card><ErrorState title="Could not load dashboard" description={error} /></Card>
      ) : data ? (
        <>
          <div className="fg-tk-cards">
            {cards.map((c) => (
              <Card key={c.label} className={`fg-stat fg-stat--${c.tone}`} onClick={() => navigate('/tickets/list')}>
                <span className="fg-stat__value">{c.value}</span>
                <span className="fg-stat__label">{c.label}</span>
              </Card>
            ))}
            <Card className="fg-stat fg-stat--info">
              <span className="fg-stat__value">{data.avgApprovalHours}h</span>
              <span className="fg-stat__label">Avg Approval Time</span>
            </Card>
          </div>

          <div className="fg-tk-charts">
            <Card title="Tickets by status"><DonutChart data={statusChart} /></Card>
            <Card title="Tickets by type"><BarChart data={typeChart} /></Card>
            <Card title="Tickets by priority"><BarChart data={priorityChart} /></Card>
            <Card title="Tickets by organization"><BarChart data={orgChart} /></Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
