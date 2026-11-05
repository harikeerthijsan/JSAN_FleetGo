import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  DataTable,
  Icon,
  Pagination,
  PageTitle,
  SearchBar,
  Select,
  StatusBadge,
  type Column,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import type { Ticket, TicketPriority, TicketStatus, TicketType } from '@/types/ticket';
import { TICKET_PRIORITIES, TICKET_TYPES } from '@/types/ticket';
import { APPROVAL_META, PRIORITY_META, STATUS_META, typeLabel } from '../ticketMeta';

function toCsv(rows: Ticket[]): string {
  const headers = ['Ticket', 'Subject', 'Type', 'Organization', 'Requester', 'Priority', 'Assigned To', 'Required', 'Approval', 'Status', 'Created'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((t) => [
    t.ticketNumber, t.subject, t.type, t.requestingOrg?.name ?? '', t.requester?.fullName ?? '',
    t.priority, t.assignedTo?.fullName ?? '', t.requiredDate ? new Date(t.requiredDate).toISOString().slice(0, 10) : '',
    t.approvalStatus, t.status, new Date(t.createdAt).toISOString().slice(0, 10),
  ].map(esc).join(','));
  return [headers.map(esc).join(','), ...lines].join('\r\n');
}

export function TicketListPage({ scope }: { scope: 'all' | 'mine' }) {
  useDocumentTitle(scope === 'mine' ? 'My Tickets' : 'All Tickets');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ticketService.list({
        page, pageSize, scope,
        search: search || undefined,
        type: (type || undefined) as TicketType | undefined,
        status: (status || undefined) as TicketStatus | undefined,
        priority: (priority || undefined) as TicketPriority | undefined,
      });
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, [page, scope, search, type, status, priority]);

  useEffect(() => { void load(); }, [load]);
  // Reset page when switching scope.
  useEffect(() => { setPage(1); }, [scope]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await ticketService.list({
        page: 1, pageSize: 1000, scope,
        search: search || undefined,
        type: (type || undefined) as TicketType | undefined,
        status: (status || undefined) as TicketStatus | undefined,
        priority: (priority || undefined) as TicketPriority | undefined,
      });
      const blob = new Blob([toCsv(res.data)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fleetgo-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Ticket>[] = [
    { key: 'num', header: 'Ticket', render: (t) => <strong>{t.ticketNumber}</strong> },
    { key: 'subject', header: 'Subject', render: (t) => (
      <div><div>{t.subject}</div><div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{typeLabel(t.type)}</div></div>
    ) },
    { key: 'org', header: 'Organization', render: (t) => t.requestingOrg?.name ?? '—' },
    { key: 'priority', header: 'Priority', render: (t) => <StatusBadge tone={PRIORITY_META[t.priority].tone}>{PRIORITY_META[t.priority].label}</StatusBadge> },
    { key: 'assigned', header: 'Assigned', render: (t) => t.assignedTo?.fullName ?? '—' },
    { key: 'required', header: 'Required', render: (t) => (t.requiredDate ? new Date(t.requiredDate).toLocaleDateString() : '—') },
    { key: 'approval', header: 'Approval', render: (t) => <StatusBadge tone={APPROVAL_META[t.approvalStatus].tone}>{APPROVAL_META[t.approvalStatus].label}</StatusBadge> },
    { key: 'status', header: 'Status', render: (t) => (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <StatusBadge tone={STATUS_META[t.status].tone}>{STATUS_META[t.status].label}</StatusBadge>
        {t.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
      </span>
    ) },
  ];

  return (
    <div>
      <PageTitle
        title={scope === 'mine' ? 'My Tickets' : 'All Tickets'}
        description={scope === 'mine' ? 'Tickets you have raised.' : 'All tickets visible to you.'}
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: scope === 'mine' ? 'My Tickets' : 'All Tickets' }]}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" loading={exporting} onClick={exportCsv} leftIcon={<Icon name="reports" size={16} />}>Export CSV</Button>
            {hasPermission('tickets:create') ? (
              <Button leftIcon={<Icon name="tickets" size={16} />} onClick={() => navigate('/tickets/new')}>Create ticket</Button>
            ) : null}
          </div>
        }
      />

      <Card flush>
        <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar placeholder="Search number or subject…" value={search} onValueChange={(v) => { setPage(1); setSearch(v); }} />
          <div style={{ width: 160 }}>
            <Select aria-label="Type" value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}
              options={[{ label: 'All types', value: '' }, ...TICKET_TYPES.map((t) => ({ label: typeLabel(t), value: t }))]} />
          </div>
          <div style={{ width: 170 }}>
            <Select aria-label="Status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}
              options={[{ label: 'All statuses', value: '' }, ...Object.entries(STATUS_META).map(([v, m]) => ({ label: m.label, value: v }))]} />
          </div>
          <div style={{ width: 150 }}>
            <Select aria-label="Priority" value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value); }}
              options={[{ label: 'All priorities', value: '' }, ...TICKET_PRIORITIES.map((p) => ({ label: PRIORITY_META[p].label, value: p }))]} />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={loading}
          emptyTitle="No tickets found"
          emptyDescription={error ?? 'Try adjusting your search or filters.'}
          onRowClick={(t) => navigate(`/tickets/${t.id}`)}
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
