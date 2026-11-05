import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  Modal,
  PageTitle,
  Select,
  Spinner,
  StatusBadge,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import { userService } from '@/services/userService';
import type { ManagedUser } from '@/types/auth';
import type { TicketDetails, TicketStatus } from '@/types/ticket';
import { APPROVAL_META, PRIORITY_META, STATUS_META, typeLabel } from '../ticketMeta';
import './TicketDetails.css';

const STEP_STATE_TONE = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', INFO_REQUESTED: 'warning', SKIPPED: 'neutral',
} as const;

// Operational transitions offered in the UI (backend re-validates).
const NEXT_STATUSES: Partial<Record<TicketStatus, TicketStatus[]>> = {
  APPROVED: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: ['CLOSED'],
  REJECTED: ['CLOSED'],
};

export function TicketDetailsPage() {
  const { id = '' } = useParams();
  const { user, hasPermission } = useAuth();
  const [ticket, setTicket] = useState<TicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Comment + attachment state
  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Decision modal
  const [decisionModal, setDecisionModal] = useState<null | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED'>(null);
  const [decisionComment, setDecisionComment] = useState('');

  // Assignment
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  useDocumentTitle(ticket ? ticket.ticketNumber : 'Ticket');

  const load = useCallback(async () => {
    try {
      setTicket(await ticketService.get(id));
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (hasPermission('users:read')) {
      userService.list({ pageSize: 200, status: 'ACTIVE' }).then((r) => setUsers(r.data)).catch(() => undefined);
    }
  }, [hasPermission]);

  const currentStep = useMemo(
    () => ticket?.approvals.find((a) => a.order === ticket.currentStep && a.state === 'PENDING') ?? null,
    [ticket],
  );

  // Can the current user act on the pending step? (UI gate; backend enforces.)
  const canDecide = useMemo(() => {
    if (!ticket || !currentStep || !user) return false;
    if (ticket.status !== 'PENDING_APPROVAL') return false;
    if (!hasPermission('tickets:approve')) return false;
    if (ticket.requesterId === user.id && user.role.name !== 'SUPER_ADMIN') return false;
    if (user.role.name === 'SUPER_ADMIN') return true;
    if (currentStep.assignedApproverId) return currentStep.assignedApproverId === user.id;
    return currentStep.approverRoleName === user.role.name;
  }, [ticket, currentStep, user, hasPermission]);

  const canManage = hasPermission('tickets:manage');
  const isRequester = ticket?.requesterId === user?.id;
  const canCancel = ticket && !['CANCELLED', 'CLOSED', 'REJECTED', 'COMPLETED'].includes(ticket.status) && (isRequester || canManage);

  const run = async (fn: () => Promise<unknown>, successMsg: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(successMsg);
      await load();
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async () => {
    if (!decisionModal) return;
    const decision = decisionModal;
    const comment = decisionComment.trim();
    setDecisionModal(null);
    setDecisionComment('');
    await run(() => ticketService.decide(id, decision, comment || undefined), 'Decision recorded');
  };

  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const body = commentBody.trim();
    const internal = commentInternal;
    setCommentBody('');
    setCommentInternal(false);
    await run(() => ticketService.comment(id, body, internal), 'Comment added');
  };

  const uploadFile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!(fd.get('file') as File)?.size) { setError('Choose a file'); return; }
    await run(async () => {
      await ticketService.uploadAttachment(id, fd);
      if (fileRef.current) fileRef.current.value = '';
    }, 'Attachment uploaded');
  };

  const downloadAttachment = async (attId: string, name: string) => {
    try {
      const blob = await ticketService.downloadAttachment(id, attId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    }
  };

  if (loading) return <Spinner block label="Loading ticket…" />;
  if (error && !ticket) return <Card><EmptyState icon="alert" title="Could not load ticket" description={error} /></Card>;
  if (!ticket) return null;

  const detailEntries = ticket.details ? Object.entries(ticket.details) : [];

  return (
    <div>
      <PageTitle
        title={ticket.ticketNumber}
        description={ticket.subject}
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: ticket.ticketNumber }]}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge tone={PRIORITY_META[ticket.priority].tone}>{PRIORITY_META[ticket.priority].label}</StatusBadge>
            <StatusBadge tone={APPROVAL_META[ticket.approvalStatus].tone}>Approval: {APPROVAL_META[ticket.approvalStatus].label}</StatusBadge>
            <StatusBadge tone={STATUS_META[ticket.status].tone}>{STATUS_META[ticket.status].label}</StatusBadge>
            {ticket.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
          </div>
        }
      />

      {ticket.approvalStatus === 'APPROVED' && ticket.allocationSummary ? (
        <Card title="Vehicle fulfillment">
          <p>Requested: {ticket.allocationSummary.requested} ? Allocated: {ticket.allocationSummary.allocated} ? Pending: {ticket.allocationSummary.pending}</p>
          {hasPermission('allocation:manage') && ticket.allocationSummary.pending > 0 && ['APPROVED','IN_PROGRESS','ON_HOLD'].includes(ticket.status) ? <Link className="fg-btn fg-btn--primary fg-btn--md" to={`/allocations/new?ticketId=${id}`}>Allocate vehicles</Link> : null}
        </Card>
      ) : null}

      {notice ? <div className="fg-auth__notice" style={{ marginBottom: 'var(--space-4)', cursor: 'pointer' }} onClick={() => setNotice(null)}>{notice}</div> : null}
      {error ? <div className="fg-auth__error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div> : null}

      {(ticket.status === 'DRAFT' || ticket.status === 'INFO_REQUIRED') && (isRequester || canManage) ? (
        <Card className="fg-tk-actionbar">
          <span>{ticket.status === 'INFO_REQUIRED' ? 'Information was requested. Update the ticket, then resubmit.' : 'This ticket is a draft.'}</span>
          <Button loading={busy} onClick={() => run(() => ticketService.submit(id), 'Ticket submitted')}>Submit for approval</Button>
        </Card>
      ) : null}

      {canDecide ? (
        <Card title="Approval decision" subtitle={`Current step: ${currentStep?.stepName}`} className="fg-tk-decision">
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button onClick={() => setDecisionModal('APPROVED')}>Approve</Button>
            <Button variant="danger" onClick={() => setDecisionModal('REJECTED')}>Reject</Button>
            <Button variant="secondary" onClick={() => setDecisionModal('INFO_REQUESTED')}>Request info</Button>
          </div>
        </Card>
      ) : null}

      <div className="fg-tk-grid">
        <div>
          <Card title="Request details">
            <dl className="fg-tk-dl">
              <div><dt>Type</dt><dd>{typeLabel(ticket.type)}</dd></div>
              <div><dt>Requester</dt><dd>{ticket.requester?.fullName ?? '—'}</dd></div>
              <div><dt>Organization</dt><dd>{ticket.requestingOrg?.name ?? '—'}</dd></div>
              <div><dt>Required date</dt><dd>{ticket.requiredDate ? new Date(ticket.requiredDate).toLocaleDateString() : '—'}</dd></div>
              {ticket.vehicle ? <div><dt>Vehicle</dt><dd>{ticket.vehicle.vehicleCode} ({ticket.vehicle.name ?? ''})</dd></div> : null}
              {ticket.requestedType ? <div><dt>Requested type</dt><dd>{ticket.requestedType.name}</dd></div> : null}
              {ticket.requestedQuantity ? <div><dt>Quantity</dt><dd>{ticket.requestedQuantity}</dd></div> : null}
              {ticket.sourceDepot ? <div><dt>Source depot</dt><dd>{ticket.sourceDepot.name}</dd></div> : null}
              {ticket.destinationDepot ? <div><dt>Destination</dt><dd>{ticket.destinationDepot.name}</dd></div> : null}
              {ticket.assignedTo ? <div><dt>Assigned to</dt><dd>{ticket.assignedTo.fullName}</dd></div> : null}
            </dl>
            {ticket.description ? <p className="fg-tk-desc">{ticket.description}</p> : null}
            {detailEntries.length ? (
              <dl className="fg-tk-dl fg-tk-dl--extra">
                {detailEntries.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Card>

          <Card title="Approval chain" className="fg-tk-section">
            {ticket.approvals.length === 0 ? (
              <EmptyState title="No approval steps" description="This ticket has not entered an approval workflow." />
            ) : (
              <ol className="fg-tk-steps">
                {ticket.approvals.map((a) => (
                  <li key={a.id} className={a.order === ticket.currentStep && ticket.approvalStatus === 'PENDING' ? 'is-current' : ''}>
                    <div className="fg-tk-steps__head">
                      <span className="fg-tk-steps__num">{a.order}</span>
                      <strong>{a.stepName}</strong>
                      <span className="fg-tk-steps__role">{a.approverRoleName}</span>
                      <StatusBadge tone={STEP_STATE_TONE[a.state]}>{a.state}</StatusBadge>
                    </div>
                    {a.decidedByName || a.comment ? (
                      <div className="fg-tk-steps__meta">
                        {a.decidedByName ? `${a.decidedByName}` : ''}{a.decidedAt ? ` · ${new Date(a.decidedAt).toLocaleString()}` : ''}
                        {a.comment ? ` · "${a.comment}"` : ''}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {canManage && ticket.approvalStatus === 'PENDING' ? (
              <div className="fg-tk-section" style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="secondary" size="sm" loading={busy} onClick={() => run(() => ticketService.escalate(id), 'Ticket escalated')}>Escalate</Button>
              </div>
            ) : null}
          </Card>

          <Card title="Comments" className="fg-tk-section">
            {ticket.comments.length === 0 ? <EmptyState title="No comments yet" /> : (
              <ul className="fg-tk-comments">
                {ticket.comments.map((c) => (
                  <li key={c.id} className={c.isInternal ? 'is-internal' : ''}>
                    <div className="fg-tk-comments__head">
                      <strong>{c.authorName ?? 'User'}</strong>
                      {c.isInternal ? <StatusBadge tone="warning">Internal</StatusBadge> : null}
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addComment} className="fg-tk-comment-form">
              <input className="fg-input" placeholder="Add a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
              {canManage ? (
                <label className="fg-tk-internal"><input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} /> Internal</label>
              ) : null}
              <Button type="submit" size="sm" disabled={!commentBody.trim()}>Post</Button>
            </form>
          </Card>
        </div>

        <div>
          {canManage ? (
            <Card title="Manage" className="fg-tk-section-first">
              <div className="fg-tk-manage">
                <Button variant="secondary" size="sm" onClick={() => setAssignOpen(true)}>Assign / reassign</Button>
                {(NEXT_STATUSES[ticket.status] ?? []).map((s) => (
                  <Button key={s} variant="secondary" size="sm" loading={busy}
                    onClick={() => run(() => ticketService.changeStatus(id, s), `Status → ${STATUS_META[s].label}`)}>
                    Mark {STATUS_META[s].label}
                  </Button>
                ))}
              </div>
            </Card>
          ) : null}

          {canCancel ? (
            <Card title="Cancel" className="fg-tk-section">
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>Cancel ticket</Button>
            </Card>
          ) : null}

          <Card title="Attachments" className="fg-tk-section">
            {ticket.attachments.length === 0 ? <EmptyState icon="inbox" title="No attachments" /> : (
              <ul className="fg-tk-files">
                {ticket.attachments.map((f) => (
                  <li key={f.id}>
                    <Icon name={f.contentType?.startsWith('video/') ? 'tracking' : 'tickets'} size={16} />
                    <button className="fg-linkbtn" onClick={() => downloadAttachment(f.id, f.fileName)}>{f.fileName}</button>
                    {f.contentType?.startsWith('video/') ? <StatusBadge tone="info">Video</StatusBadge> : f.contentType?.startsWith('image/') ? <StatusBadge tone="neutral">Photo</StatusBadge> : null}
                    <span className="fg-tk-file-time">{new Date(f.createdAt).toLocaleString()}</span>
                    {f.isInternal ? <StatusBadge tone="warning">Internal</StatusBadge> : null}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={uploadFile} className="fg-tk-upload">
              <input ref={fileRef} type="file" name="file" accept="image/*,video/*,application/pdf" required />
              {canManage ? <label className="fg-tk-internal"><input type="checkbox" name="isInternal" value="true" /> Internal</label> : null}
              <Button type="submit" size="sm" leftIcon={<Icon name="upload" size={14} />}>Upload</Button>
            </form>
          </Card>

          <Card title="Activity" className="fg-tk-section">
            {ticket.activities.length === 0 ? <EmptyState title="No activity" /> : (
              <ul className="fg-tk-timeline">
                {ticket.activities.map((a) => (
                  <li key={a.id}>
                    <span className="fg-tk-timeline__dot" />
                    <div>
                      <div>{a.summary}</div>
                      <div className="fg-tk-timeline__meta">{new Date(a.createdAt).toLocaleString()}{a.actorName ? ` · ${a.actorName}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Decision modal */}
      <Modal
        open={Boolean(decisionModal)}
        onClose={() => { setDecisionModal(null); setDecisionComment(''); }}
        title={decisionModal === 'APPROVED' ? 'Approve ticket' : decisionModal === 'REJECTED' ? 'Reject ticket' : 'Request information'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDecisionModal(null); setDecisionComment(''); }}>Cancel</Button>
            <Button variant={decisionModal === 'REJECTED' ? 'danger' : 'primary'} loading={busy} onClick={submitDecision}>Confirm</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          {decisionModal === 'APPROVED' ? 'Approve this step. An optional comment can be added.' : decisionModal === 'REJECTED' ? 'A reason is required to reject.' : 'Describe what information is needed from the requester.'}
        </p>
        <textarea className="fg-input" style={{ width: '100%', minHeight: 90, padding: 'var(--space-3)' }}
          placeholder={decisionModal === 'APPROVED' ? 'Comment (optional)' : 'Reason / message (required)'}
          value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
      </Modal>

      {/* Assignment modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign ticket"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => { setAssignOpen(false); run(() => ticketService.assign(id, { assignedToId: assignUserId || user?.id }), 'Ticket assigned'); }}>Assign</Button>
          </>
        }
      >
        {users.length ? (
          <Select label="Assign to" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}
            options={[{ label: 'Me', value: '' }, ...users.map((u) => ({ label: `${u.fullName} (${u.role.displayName})`, value: u.id }))]} />
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Assign this ticket to yourself.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel ticket"
        message={`Cancel ${ticket.ticketNumber}? This cannot be undone.`}
        confirmLabel="Cancel ticket"
        destructive
        loading={busy}
        onConfirm={() => { setCancelOpen(false); run(() => ticketService.changeStatus(id, 'CANCELLED', 'Cancelled by user'), 'Ticket cancelled'); }}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
