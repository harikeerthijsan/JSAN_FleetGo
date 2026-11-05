import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  DatePicker,
  FormInput,
  PageTitle,
  Select,
  StatusBadge,
} from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { fleetService } from '@/services/fleetService';
import { masterDataService } from '@/services/masterDataService';
import { ticketService } from '@/services/ticketService';
import { vendorApi } from '@/services/vendorService';
import type { MasterRecord, Vehicle } from '@/types/vehicle';
import type { VendorListItem } from '@/types/vendor';
import { TICKET_PRIORITIES, type TicketType } from '@/types/ticket';
import { PRIORITY_META, TYPE_LABELS, typeLabel } from '../ticketMeta';
import './CreateTicket.css';

type FieldKind = 'vehicle' | 'model' | 'quantity' | 'sourceDepot' | 'destDepot' | 'requiredDate';
type DetailField = { key: string; label: string; kind?: 'text' | 'date' | 'severity' };

// Which structured fields + detail fields each ticket type shows. (A contact
// person name + number are collected for every type, below.)
const TYPE_FIELDS: Record<TicketType, { fields: FieldKind[]; details: DetailField[] }> = {
  DELIVERY: { fields: ['model', 'quantity', 'requiredDate', 'destDepot'], details: [
    { key: 'deliveryLocation', label: 'Delivery location' }, { key: 'instructions', label: 'Special instructions' },
  ] },
  NEW_VEHICLE: { fields: ['model', 'quantity', 'requiredDate'], details: [
    { key: 'justification', label: 'Justification' },
  ] },
  PICKUP: { fields: ['vehicle', 'sourceDepot', 'requiredDate'], details: [
    { key: 'currentLocation', label: 'Current location' }, { key: 'reason', label: 'Reason for pickup' },
  ] },
  TRANSFER: { fields: ['vehicle', 'sourceDepot', 'destDepot', 'requiredDate'], details: [
    { key: 'reason', label: 'Transfer reason' },
  ] },
  RETURN: { fields: ['vehicle', 'destDepot', 'requiredDate'], details: [
    { key: 'currentCustodian', label: 'Current vendor / custodian' }, { key: 'reason', label: 'Return reason' },
  ] },
  MAINTENANCE: { fields: ['vehicle', 'sourceDepot'], details: [
    { key: 'issue', label: 'Issue description' }, { key: 'severity', label: 'Severity', kind: 'severity' },
  ] },
  DAMAGE_INCIDENT: { fields: ['vehicle'], details: [
    { key: 'damagedParts', label: 'What is damaged' }, { key: 'severity', label: 'Severity', kind: 'severity' },
    { key: 'incidentDate', label: 'Incident date', kind: 'date' }, { key: 'location', label: 'Incident location' },
    { key: 'description', label: 'Damage description' }, { key: 'damageCategory', label: 'Damage category' },
  ] },
  REPLACEMENT: { fields: ['vehicle', 'requiredDate'], details: [
    { key: 'partToReplace', label: 'What needs replacing' }, { key: 'severity', label: 'Severity', kind: 'severity' },
    { key: 'reason', label: 'Replacement reason' },
  ] },
  GENERAL: { fields: [], details: [] },
};

export function CreateTicketPage() {
  useDocumentTitle('Create Ticket');
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuth();
  // Admin / Operations (tickets:manage|approve) may raise a request on behalf of
  // a vendor and therefore choose the requesting organization. A vendor/CTS user
  // cannot — the server forces their own organization.
  const canChooseVendor = hasAnyPermission(['tickets:manage', 'tickets:approve']);

  const [type, setType] = useState<TicketType>('DELIVERY');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [requiredDate, setRequiredDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [requestingOrgId, setRequestingOrgId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [sourceDepotId, setSourceDepotId] = useState('');
  const [destinationDepotId, setDestinationDepotId] = useState('');
  const [modelId, setModelId] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  // Evidence media for damage / replacement / maintenance requests.
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<{ totalAvailable: number; byDepot: { depotName: string; count: number }[] } | null>(null);

  const [depots, setDepots] = useState<MasterRecord[]>([]);
  const [models, setModels] = useState<MasterRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);

  useEffect(() => {
    masterDataService.list('depots', { pageSize: 200 }).then((r) => setDepots(r.data)).catch(() => undefined);
    masterDataService.list('models', { pageSize: 200, active: 'true' }).then((r) => setModels(r.data)).catch(() => undefined);
    if (canChooseVendor) vendorApi.list({}, 1, 200).then((r) => setVendors(r.data)).catch(() => undefined);
  }, [canChooseVendor]);

  // Vehicle options: an admin/ops picking a vendor sees only that vendor's
  // vehicles; a vendor user is already scoped server-side to their own custody.
  useEffect(() => {
    const vendorId = canChooseVendor && requestingOrgId ? requestingOrgId : undefined;
    fleetService
      .list({ pageSize: 200, ...(vendorId ? { vendorId } : {}) })
      .then((r) => setVehicles(r.data))
      .catch(() => undefined);
  }, [canChooseVendor, requestingOrgId]);

  const config = TYPE_FIELDS[type];
  const showInventory = type === 'DELIVERY' || type === 'NEW_VEHICLE';
  // Damage, replacement and maintenance requests support photo/video evidence.
  const needsMedia = type === 'DAMAGE_INCIDENT' || type === 'REPLACEMENT' || type === 'MAINTENANCE';

  // Live availability preview for inventory-relevant requests. (All vehicles are
  // cars of a single type, so availability is the overall available count.)
  useEffect(() => {
    if (!showInventory) { setAvailability(null); return; }
    ticketService.availability({}).then(setAvailability).catch(() => setAvailability(null));
  }, [showInventory]);

  const shortage = useMemo(() => {
    if (!showInventory || !quantity || !availability) return null;
    const q = Number(quantity);
    return q > availability.totalAvailable ? q - availability.totalAvailable : 0;
  }, [showInventory, quantity, availability]);

  const setDetail = (k: string) => (v: string) => setDetails((d) => ({ ...d, [k]: v }));

  const onSubmit = async (e: FormEvent, submitNow: boolean) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) { setError('Subject is required'); return; }
    // Required-field validation driven by ticket type.
    if (config.fields.includes('vehicle') && !vehicleId) { setError('A vehicle must be selected for this ticket type'); return; }
    setSaving(true);
    try {
      const cleanDetails: Record<string, string> = Object.fromEntries(Object.entries(details).filter(([, v]) => v && v.trim()));
      // Record the chosen car model (by name) in the request details.
      const modelName = models.find((m) => m.id === modelId)?.name;
      if (modelName) cleanDetails.model = modelName;
      const created = await ticketService.create({
        type,
        subject: subject.trim(),
        description: description.trim() || undefined,
        priority: priority as never,
        requiredDate: requiredDate ? new Date(requiredDate).toISOString() : undefined,
        requestingOrgId: requestingOrgId || undefined,
        requestedQuantity: quantity ? Number(quantity) : undefined,
        vehicleId: vehicleId || undefined,
        sourceDepotId: sourceDepotId || undefined,
        destinationDepotId: destinationDepotId || undefined,
        details: Object.keys(cleanDetails).length ? cleanDetails : undefined,
      });
      // Upload any photo/video evidence against the new ticket (timestamped on
      // upload by the server).
      for (const file of [...photos, ...videos]) {
        const fd = new FormData();
        fd.append('file', file);
        await ticketService.uploadAttachment(created.id, fd);
      }
      if (submitNow) {
        try { await ticketService.submit(created.id); } catch (err) {
          // Created as draft; surface submit error but still navigate to it.
          navigate(`/tickets/${created.id}`);
          return;
        }
      }
      navigate(`/tickets/${created.id}`);
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Could not create ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Create Ticket"
        description="The form adapts to the selected request type. Only relevant fields are required."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Tickets', to: '/tickets' }, { label: 'Create' }]}
      />
      <form onSubmit={(e) => onSubmit(e, true)}>
        {error ? <div className="fg-auth__error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div> : null}

        <Card title="Request">
          <div className="fg-tk-form-grid">
            <Select label="Ticket type" value={type} onChange={(e) => { setType(e.target.value as TicketType); setError(null); }}
              options={Object.keys(TYPE_LABELS).map((t) => ({ label: typeLabel(t as TicketType), value: t }))} required />
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}
              options={TICKET_PRIORITIES.map((p) => ({ label: PRIORITY_META[p].label, value: p }))} />
            <FormInput label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            {canChooseVendor ? (
              <Select
                label="Requesting vendor / organization"
                value={requestingOrgId}
                onChange={(e) => { setRequestingOrgId(e.target.value); setVehicleId(''); }}
                options={[{ label: '— Select vendor —', value: '' }, ...vendors.map((v) => ({ label: v.name, value: v.id }))]}
              />
            ) : null}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <FormInput label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </Card>

        <Card title="Details" className="fg-tk-form-section">
          <div className="fg-tk-form-grid">
            {config.fields.includes('model') ? (
              <Select label="Vehicle model" value={modelId} onChange={(e) => setModelId(e.target.value)}
                options={[{ label: '— Select model —', value: '' }, ...models.map((m) => ({ label: m.name, value: m.id }))]} />
            ) : null}
            {config.fields.includes('quantity') ? (
              <FormInput label="Quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            ) : null}
            {config.fields.includes('vehicle') ? (
              <Select label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required
                options={[{ label: 'Select a vehicle', value: '' }, ...vehicles.map((v) => ({ label: `${v.vehicleCode} — ${v.registrationNumber}`, value: v.id }))]} />
            ) : null}
            {config.fields.includes('sourceDepot') ? (
              <Select label="Source / current depot" value={sourceDepotId} onChange={(e) => setSourceDepotId(e.target.value)}
                options={[{ label: '—', value: '' }, ...depots.map((d) => ({ label: d.name, value: d.id }))]} />
            ) : null}
            {config.fields.includes('destDepot') ? (
              <Select label="Destination depot / location" value={destinationDepotId} onChange={(e) => setDestinationDepotId(e.target.value)}
                options={[{ label: '—', value: '' }, ...depots.map((d) => ({ label: d.name, value: d.id }))]} />
            ) : null}
            {config.fields.includes('requiredDate') ? (
              <DatePicker label="Required date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            ) : null}
            {config.details.map((f) =>
              f.kind === 'date' ? (
                <DatePicker key={f.key} label={f.label} value={details[f.key] ?? ''} onChange={(e) => setDetail(f.key)(e.target.value)} />
              ) : f.kind === 'severity' ? (
                <Select key={f.key} label={f.label} value={details[f.key] ?? ''} onChange={(e) => setDetail(f.key)(e.target.value)}
                  options={[{ label: '—', value: '' }, { label: 'Low', value: 'LOW' }, { label: 'Medium', value: 'MEDIUM' }, { label: 'High', value: 'HIGH' }, { label: 'Critical', value: 'CRITICAL' }]} />
              ) : (
                <FormInput key={f.key} label={f.label} value={details[f.key] ?? ''} onChange={(e) => setDetail(f.key)(e.target.value)} />
              ),
            )}
            <FormInput label="Contact person name" value={details.contactName ?? ''} onChange={(e) => setDetail('contactName')(e.target.value)} />
            <FormInput label="Contact number" type="tel" value={details.contactNumber ?? ''} onChange={(e) => setDetail('contactNumber')(e.target.value)} />
          </div>

          {showInventory && availability ? (
            <div className="fg-tk-avail">
              <div className="fg-tk-avail__head">
                <strong>Inventory availability</strong>
                <StatusBadge tone={availability.totalAvailable > 0 ? 'success' : 'danger'}>
                  {availability.totalAvailable} available
                </StatusBadge>
                {shortage && shortage > 0 ? <StatusBadge tone="warning">Shortage: {shortage}</StatusBadge> : null}
              </div>
              <div className="fg-tk-avail__depots">
                {availability.byDepot.length === 0 ? (
                  <span className="fg-tk-avail__none">No available vehicles match. The ticket can still be raised and handled as an exception.</span>
                ) : (
                  availability.byDepot.map((d) => (
                    <span key={d.depotName} className="fg-tk-avail__chip">{d.depotName}: {d.count}</span>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {needsMedia ? (
            <div className="fg-tk-media">
              <p className="fg-tk-media__hint">Attach photo and video evidence. Each file is timestamped on upload.</p>
              <div className="fg-tk-form-grid">
                <label className="fg-tk-file">
                  <span>Photos</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
                  {photos.length ? <small>{photos.length} photo(s) selected</small> : null}
                </label>
                <label className="fg-tk-file">
                  <span>Videos</span>
                  <input type="file" accept="video/*" multiple onChange={(e) => setVideos(Array.from(e.target.files ?? []))} />
                  {videos.length ? <small>{videos.length} video(s) selected</small> : null}
                </label>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="fg-tk-form-actions">
          <Button variant="secondary" type="button" onClick={() => navigate('/tickets')} disabled={saving}>Cancel</Button>
          <Button variant="secondary" type="button" loading={saving} onClick={(e) => onSubmit(e as never, false)}>Save as draft</Button>
          <Button type="submit" loading={saving}>Create &amp; submit</Button>
        </div>
      </form>
    </div>
  );
}
