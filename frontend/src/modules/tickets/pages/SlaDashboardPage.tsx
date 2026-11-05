import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  DataTable,
  PageTitle,
  Spinner,
  StatusBadge,
  type Column,
} from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import type { Ticket } from '@/types/ticket';
import { STATUS_META, typeLabel } from '../ticketMeta';

type SlaRow = Ticket & { approvalBreach: boolean; resolutionBreach: boolean; approvalHours: number | null };

export function SlaDashboardPage() {
  useDocumentTitle('SLA Dashboard');
  const navigate = useNavigate();
  const [data, setData] = useState<{ total: number; approvalBreaches: number; resolutionBreaches: number; rows: SlaRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ticketService
      .slaReport()
      .then((d) => setData(d as never))
      .catch((e) => setError((e as NormalizedApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<SlaRow>[] = [
    { key: 'num', header: 'Ticket', render: (t) => <strong>{t.ticketNumber}</strong> },
    { key: 'type', header: 'Type', render: (t) => typeLabel(t.type) },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge tone={STATUS_META[t.status].tone}>{STATUS_META[t.status].label}</StatusBadge> },
    { key: 'submitted', header: 'Submitted', render: (t) => (t.submittedAt ? new Date(t.submittedAt).toLocaleDateString() : '—') },
    { key: 'approvalHours', header: 'Approval Time', render: (t) => (t.approvalHours != null ? `${t.approvalHours}h` : '—') },
    { key: 'approvalBreach', header: 'Approval SLA', render: (t) => <StatusBadge tone={t.approvalBreach ? 'danger' : 'success'}>{t.approvalBreach ? 'Breached' : 'OK'}</StatusBadge> },
    { key: 'resolutionBreach', header: 'Resolution SLA', render: (t) => <StatusBadge tone={t.resolutionBreach ? 'danger' : 'success'}>{t.resolutionBreach ? 'Breached' : 'OK'}</StatusBadge> },
  ];

  return (
    <div>
      <PageTitle
        title="SLA Dashboard"
        description="Approval and resolution SLA performance across submitted tickets."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: 'SLA' }]}
      />
      {loading ? (
        <Spinner block label="Loading SLA report…" />
      ) : (
        <>
          <div className="fg-tk-cards">
            <Card className="fg-stat fg-stat--primary"><span className="fg-stat__value">{data?.total ?? 0}</span><span className="fg-stat__label">Submitted Tickets</span></Card>
            <Card className="fg-stat fg-stat--danger"><span className="fg-stat__value">{data?.approvalBreaches ?? 0}</span><span className="fg-stat__label">Approval SLA Breaches</span></Card>
            <Card className="fg-stat fg-stat--danger"><span className="fg-stat__value">{data?.resolutionBreaches ?? 0}</span><span className="fg-stat__label">Resolution SLA Breaches</span></Card>
          </div>
          <Card flush className="fg-tk-section">
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(t) => t.id}
              emptyTitle="No submitted tickets"
              emptyDescription={error ?? undefined}
              onRowClick={(t) => navigate(`/tickets/${t.id}`)}
            />
          </Card>
        </>
      )}
    </div>
  );
}
