import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormInput,
  Icon,
  Modal,
  PageTitle,
  Select,
  Spinner,
  StatusBadge,
} from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { ticketService } from '@/services/ticketService';
import type { ApprovalWorkflow, WorkflowStep } from '@/types/ticket';
import { TICKET_TYPES } from '@/types/ticket';
import { typeLabel } from '../ticketMeta';
import './Workflows.css';

const ROLE_OPTIONS = [
  { label: 'Operations Manager', value: 'OPERATIONS_MANAGER' },
  { label: 'JSAN Admin', value: 'JSAN_ADMIN' },
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
];

interface Draft {
  id?: string;
  name: string;
  description: string;
  ticketType: string;
  allowSelfApproval: boolean;
  isActive: boolean;
  isDefault: boolean;
  steps: WorkflowStep[];
}

const EMPTY: Draft = {
  name: '', description: '', ticketType: '', allowSelfApproval: false, isActive: true, isDefault: false,
  steps: [{ name: 'Operations Review', approverRoleName: 'OPERATIONS_MANAGER', slaHours: 24 }],
};

export function WorkflowConfigPage() {
  useDocumentTitle('Approval Workflows');
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkflows(await ticketService.listWorkflows());
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setDraft(EMPTY); setOpen(true); };
  const openEdit = (w: ApprovalWorkflow) => {
    setDraft({
      id: w.id, name: w.name, description: w.description ?? '', ticketType: w.ticketType ?? '',
      allowSelfApproval: w.allowSelfApproval, isActive: w.isActive, isDefault: w.isDefault,
      steps: w.steps.map((s) => ({ name: s.name, approverRoleName: s.approverRoleName, slaHours: s.slaHours ?? undefined })),
    });
    setOpen(true);
  };

  const setStep = (i: number, patch: Partial<WorkflowStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const addStep = () => setDraft((d) => ({ ...d, steps: [...d.steps, { name: '', approverRoleName: 'OPERATIONS_MANAGER' }] }));
  const removeStep = (i: number) => setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!draft.name.trim() || draft.steps.length === 0 || draft.steps.some((s) => !s.name.trim())) {
      setError('Name and at least one named step are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        ticketType: (draft.ticketType || null) as never,
        allowSelfApproval: draft.allowSelfApproval,
        isActive: draft.isActive,
        isDefault: draft.isDefault,
        steps: draft.steps.map((s) => ({ name: s.name.trim(), approverRoleName: s.approverRoleName, slaHours: s.slaHours ? Number(s.slaHours) : undefined })),
      };
      if (draft.id) await ticketService.updateWorkflow(draft.id, payload);
      else await ticketService.createWorkflow(payload);
      setOpen(false);
      setNotice(`Workflow ${draft.id ? 'updated' : 'created'}.`);
      await load();
    } catch (err) {
      setError((err as NormalizedApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Approval Workflow Configuration"
        description="Configure the approval chain per ticket type. Workflows are resolved at submission; the most specific active workflow applies."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: 'Workflows' }]}
        actions={<Button leftIcon={<Icon name="settings" size={16} />} onClick={openCreate}>New workflow</Button>}
      />

      {notice ? <div className="fg-auth__notice" style={{ marginBottom: 'var(--space-4)', cursor: 'pointer' }} onClick={() => setNotice(null)}>{notice}</div> : null}

      {loading ? (
        <Spinner block label="Loading workflows…" />
      ) : workflows.length === 0 ? (
        <Card><EmptyState title="No workflows" description={error ?? 'Create a workflow to require approvals.'} /></Card>
      ) : (
        <div className="fg-wf-list">
          {workflows.map((w) => (
            <Card key={w.id} title={w.name}
              subtitle={w.ticketType ? `Applies to: ${typeLabel(w.ticketType)}` : 'Applies to: all ticket types'}
              actions={<Button variant="ghost" size="sm" onClick={() => openEdit(w)}>Edit</Button>}>
              <div className="fg-wf-badges">
                {w.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
                <StatusBadge tone={w.isActive ? 'success' : 'neutral'}>{w.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                {w.allowSelfApproval ? <StatusBadge tone="warning">Self-approval allowed</StatusBadge> : null}
              </div>
              <ol className="fg-wf-steps">
                {w.steps.map((s) => (
                  <li key={s.order}>
                    <span className="fg-wf-steps__num">{s.order}</span>
                    <strong>{s.name}</strong>
                    <span className="fg-wf-steps__role">{s.approverRoleName}</span>
                    {s.slaHours ? <span className="fg-wf-steps__sla">SLA {s.slaHours}h</span> : null}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={draft.id ? 'Edit workflow' : 'New workflow'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="wf-form" loading={saving}>{draft.id ? 'Save' : 'Create'}</Button>
          </>
        }
      >
        <form id="wf-form" onSubmit={save}>
          {error ? <div className="fg-auth__error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div> : null}
          <div className="fg-tk-form-grid">
            <FormInput label="Name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required />
            <Select label="Applies to ticket type" value={draft.ticketType} onChange={(e) => setDraft((d) => ({ ...d, ticketType: e.target.value }))}
              options={[{ label: 'All types (default)', value: '' }, ...TICKET_TYPES.map((t) => ({ label: typeLabel(t), value: t }))]} />
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <FormInput label="Description" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="fg-wf-flags">
            <label><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} /> Active</label>
            <label><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} /> Default</label>
            <label><input type="checkbox" checked={draft.allowSelfApproval} onChange={(e) => setDraft((d) => ({ ...d, allowSelfApproval: e.target.checked }))} /> Allow self-approval</label>
          </div>

          <div className="fg-wf-steps-edit">
            <div className="fg-wf-steps-edit__head"><strong>Approval steps</strong><Button type="button" size="sm" variant="secondary" onClick={addStep}>Add step</Button></div>
            {draft.steps.map((s, i) => (
              <div key={i} className="fg-wf-step-row">
                <span className="fg-wf-steps__num">{i + 1}</span>
                <FormInput aria-label="Step name" placeholder="Step name" value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                <Select aria-label="Approver role" value={s.approverRoleName} onChange={(e) => setStep(i, { approverRoleName: e.target.value })} options={ROLE_OPTIONS} />
                <FormInput aria-label="SLA hours" type="number" placeholder="SLA h" value={s.slaHours ? String(s.slaHours) : ''} onChange={(e) => setStep(i, { slaHours: e.target.value ? Number(e.target.value) : undefined })} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)} disabled={draft.steps.length <= 1}>Remove</Button>
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
}
