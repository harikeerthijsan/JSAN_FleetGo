import { useEffect, useState } from 'react';
import { BarChart, Card, DonutChart, PageTitle, Spinner, type ChartDatum } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import type { TicketDashboard } from '@/types/ticket';
import { typeLabel } from '../ticketMeta';

export function TicketReportsPage() {
  useDocumentTitle('Ticket Reports');
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

  const chart = (items: { label: string; count: number }[], mapLabel = (s: string) => s): ChartDatum[] =>
    items.map((i) => ({ label: mapLabel(i.label), count: i.count }));

  return (
    <div>
      <PageTitle
        title="Ticket Reports"
        description="Aggregate ticket reporting sourced from live database data."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: 'Reports' }]}
      />
      {loading ? (
        <Spinner block label="Loading reports…" />
      ) : error ? (
        <Card><p style={{ color: 'var(--color-danger)' }}>{error}</p></Card>
      ) : data ? (
        <>
          <div className="fg-tk-cards">
            <Card className="fg-stat fg-stat--primary"><span className="fg-stat__value">{data.total}</span><span className="fg-stat__label">Total Tickets</span></Card>
            <Card className="fg-stat fg-stat--info"><span className="fg-stat__value">{data.avgApprovalHours}h</span><span className="fg-stat__label">Avg Approval Time</span></Card>
            <Card className="fg-stat fg-stat--danger"><span className="fg-stat__value">{data.cards.overdue}</span><span className="fg-stat__label">Overdue</span></Card>
          </div>
          <div className="fg-tk-charts fg-tk-section">
            <Card title="By status"><DonutChart data={chart(data.byStatus)} /></Card>
            <Card title="By type"><BarChart data={chart(data.byType, (l) => typeLabel(l as never))} /></Card>
            <Card title="By priority"><BarChart data={chart(data.byPriority)} /></Card>
            <Card title="By organization"><BarChart data={chart(data.byOrganization)} /></Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
