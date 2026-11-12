import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormInput,
  Icon,
  PageTitle,
  Select,
  Spinner,
  StatusBadge,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { fleetService } from '@/services/fleetService';
import type {
  Vehicle,
  VehicleDocument,
  VehicleHistory,
  VehicleStatus,
} from '@/types/vehicle';
import { STATUS_META, statusLabel } from '../statusMeta';
import './VehicleDetails.css';

type Tab = 'general' | 'compliance' | 'location' | 'documents' | 'history';

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : '—';
}
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fg-detail__field">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

export function VehicleDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('fleet:manage');

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [notice, setNotice] = useState<string | null>(null);

  const [transitions, setTransitions] = useState<Record<VehicleStatus, VehicleStatus[]>>(
    {} as Record<VehicleStatus, VehicleStatus[]>,
  );
  const [nextStatus, setNextStatus] = useState('');
  const [reason, setReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const [docs, setDocs] = useState<VehicleDocument[]>([]);
  const [history, setHistory] = useState<VehicleHistory | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  useDocumentTitle(vehicle ? vehicle.vehicleCode : 'Vehicle');

  const loadVehicle = useCallback(async () => {
    try {
      const v = await fleetService.get(id);
      setVehicle(v);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadVehicle(); }, [loadVehicle]);
  useEffect(() => {
    fleetService.statusTransitions().then(setTransitions).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (tab === 'documents') fleetService.listDocuments(id).then(setDocs).catch(() => undefined);
    if (tab === 'history') fleetService.history(id).then(setHistory).catch(() => undefined);
  }, [tab, id]);

  const applyStatus = async () => {
    if (!nextStatus) return;
    setStatusBusy(true);
    try {
      const updated = await fleetService.changeStatus(id, nextStatus as VehicleStatus, reason || undefined);
      setVehicle(updated);
      setNextStatus('');
      setReason('');
      setNotice(`Status changed to ${statusLabel(updated.status)}.`);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setStatusBusy(false);
    }
  };

  const viewDoc = async (doc: VehicleDocument) => {
    try {
      const blob = await fleetService.downloadDocument(id, doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    }
  };

  const deleteDoc = async (doc: VehicleDocument) => {
    try {
      await fleetService.deleteDocument(id, doc.id);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
      void loadVehicle();
    } catch (e) {
      setError((e as NormalizedApiError).message);
    }
  };

  const confirmDeactivate = async () => {
    try {
      const v = await fleetService.deactivate(id);
      setVehicle(v);
      setDeactivateOpen(false);
      setNotice('Vehicle deactivated.');
    } catch (e) {
      setError((e as NormalizedApiError).message);
      setDeactivateOpen(false);
    }
  };

  if (loading) return <Spinner block label="Loading vehicle…" />;
  if (error && !vehicle) {
    return (
      <Card><EmptyState icon="alert" title="Could not load vehicle" description={error} /></Card>
    );
  }
  if (!vehicle) return null;

  const allowed = transitions[vehicle.status] ?? [];
  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'location', label: 'Location & Custody' },
    { key: 'documents', label: 'Documents, Photos & Videos' },
    { key: 'history', label: 'Activity & History' },
  ];

  return (
    <div>
      <PageTitle
        title={vehicle.vehicleCode}
        description={`${vehicle.registrationNumber}${vehicle.make ? ' · ' + vehicle.make.name : ''}${vehicle.model ? ' ' + vehicle.model.name : ''}`}
        breadcrumbs={[
          { label: 'FleetGo', to: '/dashboard' },
          { label: 'Inventory', to: '/inventory' },
          { label: 'Vehicles', to: '/inventory/vehicles' },
          { label: vehicle.vehicleCode },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <StatusBadge tone={STATUS_META[vehicle.status].tone}>{STATUS_META[vehicle.status].label}</StatusBadge>
            {!vehicle.isActive ? <StatusBadge tone="neutral">Inactive</StatusBadge> : null}
            {canManage ? (
              <Button variant="secondary" onClick={() => navigate(`/inventory/vehicles/${id}/edit`)}>Edit</Button>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <div className="fg-auth__notice" style={{ marginBottom: 'var(--space-4)', cursor: 'pointer' }} onClick={() => setNotice(null)}>{notice}</div>
      ) : null}
      {error ? (
        <div className="fg-auth__error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>
      ) : null}

      <div className="fg-detail__tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`fg-detail__tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <Card title="General information">
          <dl className="fg-detail__grid">
            <Field label="Vehicle ID" value={vehicle.vehicleCode} />
            <Field label="Registration number" value={vehicle.registrationNumber} />
            <Field label="VIN / Chassis" value={vehicle.vin} />
            <Field label="Engine number" value={vehicle.engineNumber} />
            <Field label="Make" value={vehicle.make?.name} />
            <Field label="Model" value={vehicle.model ? (vehicle.model.variant ? `${vehicle.model.name} (${vehicle.model.variant})` : vehicle.model.name) : null} />
            <Field label="Fuel type" value={vehicle.fuelType?.name} />
            <Field label="Manufacturing year" value={vehicle.manufacturingYear} />
            <Field label="Color" value={vehicle.color} />
            <Field label="Ownership" value={vehicle.ownershipType?.name} />
            <Field label="Registered by" value={vehicle.createdBy?.fullName} />
            <Field label="Remarks" value={vehicle.remarks} />
          </dl>
        </Card>
      ) : null}

      {tab === 'compliance' ? (
        <Card title="Registration & compliance">
          <dl className="fg-detail__grid">
            <Field label="Registration certificate no." value={vehicle.registrationCertNumber} />
            <Field label="Registration expiry" value={fmtDate(vehicle.registrationExpiry)} />
            <Field label="Insurance provider" value={vehicle.insuranceProvider} />
            <Field label="Insurance policy no." value={vehicle.insurancePolicyNumber} />
            <Field label="Insurance expiry" value={fmtDate(vehicle.insuranceExpiry)} />
          </dl>
        </Card>
      ) : null}

      {tab === 'location' ? (
        <>
          <Card title="Current location & custody">
            <dl className="fg-detail__grid">
              <Field label="Current depot" value={vehicle.depot ? `${vehicle.depot.name} (${vehicle.depot.code})` : null} />
              <Field label="Assigned organization" value={vehicle.organization?.name} />
              <Field label="Current vendor" value={vehicle.vendor?.name} />
              <Field label="Status" value={<StatusBadge tone={STATUS_META[vehicle.status].tone}>{STATUS_META[vehicle.status].label}</StatusBadge>} />
            </dl>
          </Card>
          {canManage ? (
            <Card title="Change status" className="fg-detail__section"
              subtitle="Only valid lifecycle transitions are allowed.">
              {allowed.length === 0 ? (
                <EmptyState title="No transitions available" description={`No further status changes are permitted from ${statusLabel(vehicle.status)}.`} />
              ) : (
                <div className="fg-detail__status-form">
                  <Select aria-label="New status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}
                    placeholder="Select new status"
                    options={allowed.map((s) => ({ label: statusLabel(s), value: s }))} />
                  <FormInput aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Button loading={statusBusy} disabled={!nextStatus} onClick={applyStatus}>Apply</Button>
                </div>
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'documents' ? (
        <>
          {canManage ? <p className="fg-form-note">Documents and media are attached in the registration or edit form. Use Edit to add more files.</p> : null}
          <Card title="Documents, photos & videos" className="fg-detail__section" flush>
            {docs.length === 0 ? (
              <EmptyState icon="inbox" title="No documents" description="No documents, photos or videos have been uploaded for this vehicle." />
            ) : (
              <ul className="fg-doc-list">
                {docs.map((d) => (
                  <li key={d.id} className="fg-doc">
                    <span className="fg-doc__icon"><Icon name={d.kind === 'PHOTO' ? 'inspections' : 'tickets'} size={18} /></span>
                    <span className="fg-doc__meta">
                      <span className="fg-doc__name">{d.label || d.fileName}</span>
                      <span className="fg-doc__sub">
                        {d.contentType.startsWith('video/') ? 'VIDEO' : d.kind} · {(d.size / 1024).toFixed(0)} KB
                        {d.documentType ? ` · ${d.documentType.name}` : ''}
                        {d.isSensitive ? ' · Sensitive' : ''}
                        {d.uploadedBy ? ` · ${d.uploadedBy.fullName}` : ''}
                      </span>
                    </span>
                    <span className="fg-doc__actions">
                      <Button variant="ghost" size="sm" onClick={() => viewDoc(d)}>View</Button>
                      {canManage ? <Button variant="ghost" size="sm" onClick={() => deleteDoc(d)}>Delete</Button> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'history' ? (
        <>
          <Card title="Status history">
            {!history || history.statusHistory.length === 0 ? (
              <EmptyState title="No history" />
            ) : (
              <ul className="fg-timeline">
                {history.statusHistory.map((h) => (
                  <li key={h.id}>
                    <span className="fg-timeline__dot" />
                    <div>
                      <div>
                        {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ''}
                        <strong>{statusLabel(h.toStatus)}</strong>
                      </div>
                      <div className="fg-timeline__meta">
                        {new Date(h.createdAt).toLocaleString()}
                        {h.changedBy ? ` · ${h.changedBy.fullName}` : ''}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Audit trail" className="fg-detail__section">
            {!history || history.auditLogs.length === 0 ? (
              <EmptyState title="No audit entries" />
            ) : (
              <ul className="fg-timeline">
                {history.auditLogs.map((a) => (
                  <li key={a.id}>
                    <span className="fg-timeline__dot fg-timeline__dot--muted" />
                    <div>
                      <div><strong>{a.action}</strong></div>
                      <div className="fg-timeline__meta">
                        {new Date(a.createdAt).toLocaleString()}
                        {a.actor ? ` · ${a.actor.fullName}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {canManage && vehicle.isActive ? (
        <div className="fg-detail__danger">
          <Button variant="danger" onClick={() => setDeactivateOpen(true)}>Deactivate vehicle</Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate vehicle"
        message={`Deactivate ${vehicle.vehicleCode}? The record is preserved but marked inactive and set to INACTIVE status.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />
    </div>
  );
}
