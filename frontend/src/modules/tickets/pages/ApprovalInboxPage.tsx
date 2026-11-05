import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  DataTable,
  PageTitle,
  StatusBadge,
  type Column,
} from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import type { Ticket } from '@/types/ticket';
import { PRIORITY_META, typeLabel } from '../ticketMeta';

export function ApprovalInboxPage() {
  useDocumentTitle('Approval Inbox');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ticketService
      .inbox()
      .then(setRows)
      .catch((e) => setError((e as NormalizedApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<Ticket>[] = [
    { key: 'num', header: 'Ticket', render: (t) => <strong>{t.ticketNumber}</strong> },
    { key: 'subject', header: 'Subject', render: (t) => t.subject },
    { key: 'type', header: 'Type', render: (t) => typeLabel(t.type) },
    { key: 'org', header: 'Organization', render: (t) => t.requestingOrg?.name ?? '—' },
    { key: 'priority', header: 'Priority', render: (t) => <StatusBadge tone={PRIORITY_META[t.priority].tone}>{PRIORITY_META[t.priority].label}</StatusBadge> },
    { key: 'step', header: 'Step', render: (t) => `#${t.currentStep}` },
    { key: 'overdue', header: '', render: (t) => (t.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null) },
  ];

  return (
    <div>
      <PageTitle
        title="Approval Inbox"
        description="Tickets awaiting your approval decision."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: 'Approval Inbox' }]}
      />
      <Card flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={loading}
          emptyTitle="Nothing awaiting your approval"
          emptyDescription={error ?? 'Approved and rejected tickets leave your inbox.'}
          onRowClick={(t) => navigate(`/tickets/${t.id}`)}
        />
      </Card>
    </div>
  );
}
