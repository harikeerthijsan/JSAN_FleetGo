import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  DatePicker,
  FormInput,
  PageTitle,
  Select,
  Spinner,
} from '@/components';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { fleetService } from '@/services/fleetService';
import { masterDataService } from '@/services/masterDataService';
import { inventoryApi } from '@/services/inventoryService';
import type { InventoryLookups } from '@/types/inventory';
import type { Organization } from '@/types/auth';
import type { MasterRecord } from '@/types/vehicle';
import './VehicleForm.css';

type FormState = Record<string, string>;
const EMPTY: FormState = {
  registrationNumber: '', vin: '', engineNumber: '', makeId: '', modelId: '',
  typeId: '', categoryId: '', fuelTypeId: '', ownershipTypeId: '',
  manufacturingYear: '', color: '', organizationId: '', vendorId: '', depotId: '',
  insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '',
  registrationCertNumber: '', registrationExpiry: '', remarks: '',
  receivedAt: '', receivedFromOrgId: '', custodianType: 'DEPOT',
  initialCondition: 'GOOD', odometer: '', accessories: '',
};

/** '' → undefined; date (yyyy-mm-dd) → ISO; numbers coerced. */
function buildPayload(form: FormState): Record<string, unknown> {
  const p: Record<string, unknown> = {
    registrationNumber: form.registrationNumber.trim(),
  };
  const put = (k: string, v: string) => { if (v.trim()) p[k] = v.trim(); };
  (['vin', 'engineNumber', 'makeId', 'modelId', 'typeId', 'categoryId',
    'fuelTypeId', 'ownershipTypeId', 'color', 'organizationId', 'vendorId',
    'depotId', 'insuranceProvider', 'insurancePolicyNumber',
    'registrationCertNumber', 'remarks'] as const).forEach((k) => put(k, form[k]));
  if (form.manufacturingYear.trim()) p.manufacturingYear = Number(form.manufacturingYear);
  if (form.insuranceExpiry) p.insuranceExpiry = new Date(form.insuranceExpiry).toISOString();
  if (form.registrationExpiry) p.registrationExpiry = new Date(form.registrationExpiry).toISOString();
  return p;
}

export function VehicleFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? 'Edit Vehicle' : 'Register Vehicle');
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(() => {
    const now = new Date();
    return { ...EMPTY, receivedAt: new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16) };
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { blocker, allowNavigation } = useUnsavedChanges(dirty);
  useEffect(() => {
    if (Object.keys(fieldErrors).length) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  const [makes, setMakes] = useState<MasterRecord[]>([]);
  const [models, setModels] = useState<MasterRecord[]>([]);
  const [fuels, setFuels] = useState<MasterRecord[]>([]);
  const [ownerships, setOwnerships] = useState<MasterRecord[]>([]);
  const [depots, setDepots] = useState<MasterRecord[]>([]);
  const [orgs, setOrgs] = useState<Pick<Organization, 'id' | 'name' | 'type'>[]>([]);

  const set = (k: keyof FormState) => (v: string) => {
    setDirty(true); setFieldErrors((errors) => ({ ...errors, [k]: '' }));
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    const opt = { pageSize: 200, active: 'true' as const };
    masterDataService.list('makes', opt).then((r) => setMakes(r.data)).catch(() => setLookupError(true));
    masterDataService.list('models', { pageSize: 200, active: 'true' }).then((r) => setModels(r.data)).catch(() => setLookupError(true));
    masterDataService.list('fuel-types', opt).then((r) => setFuels(r.data)).catch(() => setLookupError(true));
    masterDataService.list('ownership-types', opt).then((r) => setOwnerships(r.data)).catch(() => setLookupError(true));
    inventoryApi.get<InventoryLookups>('/lookups').then((r) => {
      setOrgs(r.organizations.map((o) => ({ id: o.id, name: o.name, type: o.type as Organization['type'] })));
      setDepots(r.depots);
    }).catch(() => setLookupError(true));
  }, []);

  useEffect(() => {
    if (!id) return;
    fleetService.get(id)
      .then((v) => {
        setForm({
          registrationNumber: v.registrationNumber, vin: v.vin ?? '',
          engineNumber: v.engineNumber ?? '', makeId: v.make?.id ?? '',
          modelId: v.model?.id ?? '', typeId: v.type?.id ?? '',
          categoryId: v.category?.id ?? '', fuelTypeId: v.fuelType?.id ?? '',
          ownershipTypeId: v.ownershipType?.id ?? '',
          manufacturingYear: v.manufacturingYear ? String(v.manufacturingYear) : '',
          color: v.color ?? '', organizationId: v.organization?.id ?? '',
          vendorId: v.vendor?.id ?? '', depotId: v.depot?.id ?? '',
          insuranceProvider: v.insuranceProvider ?? '',
          insurancePolicyNumber: v.insurancePolicyNumber ?? '',
          insuranceExpiry: v.insuranceExpiry ? v.insuranceExpiry.slice(0, 10) : '',
          registrationCertNumber: v.registrationCertNumber ?? '',
          registrationExpiry: v.registrationExpiry ? v.registrationExpiry.slice(0, 10) : '',
          remarks: v.remarks ?? '',
        });
      })
      .catch((e) => { setLoadFailed(true); setError((e as NormalizedApiError).message); })
      .finally(() => setLoading(false));
  }, [id]);

  const filteredModels = useMemo(
    () => (form.makeId ? models.filter((m) => m.makeId === form.makeId) : models),
    [models, form.makeId],
  );
  const vendorOrgs = useMemo(
    () => orgs.filter((o) => o.type === 'VEHICLE_VENDOR' || o.type === 'TRANSPORT_PARTNER'),
    [orgs],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || registeredId) return;
    setError(null);
    const invalid: Record<string, string> = {};
    if (!form.registrationNumber.trim()) invalid.registrationNumber = 'Enter a registration number.';
    if (!isEdit) {
      if (!form.organizationId) invalid.organizationId = 'Choose the assigned organization.';
      if (!form.depotId) invalid.depotId = 'Choose the current depot.';
      if (!form.receivedFromOrgId) invalid.receivedFromOrgId = 'Choose the source organization.';
      if (!form.receivedAt || Number.isNaN(new Date(form.receivedAt).getTime()) || new Date(form.receivedAt).getTime() > Date.now() + 60000) invalid.receivedAt = 'Enter a valid arrival date and time that is not in the future.';
      if (form.custodianType === 'VENDOR' && !form.vendorId) invalid.vendorId = 'Choose the current vendor.';
      if (form.odometer && (!Number.isInteger(Number(form.odometer)) || Number(form.odometer) < 0 || Number(form.odometer) > 10000000)) invalid.odometer = 'Enter a whole number from 0 to 10000000.';
    }
    if (form.vin.trim() && !/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(form.vin.trim())) invalid.vin = 'Use 11?17 letters and numbers, excluding I, O and Q.';
    const year = Number(form.manufacturingYear);
    if (form.manufacturingYear && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1)) invalid.manufacturingYear = `Use a year between 1950 and ${new Date().getFullYear() + 1}.`;
    if ([...photos, ...videos, ...documents].some((file) => file.size > 104_857_600)) invalid.media = 'Each photo, video or document must be 100 MB or less.';
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) { setError('Check the highlighted fields before saving.'); return; }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (!isEdit) payload.receiving = {
        receivedAt: new Date(form.receivedAt).toISOString(),
        receivedFromOrgId: form.receivedFromOrgId,
        custodianType: form.custodianType,
        custodianId: form.custodianType === 'DEPOT' ? form.depotId : form.custodianType === 'VENDOR' ? form.vendorId : form.organizationId,
        initialCondition: form.initialCondition,
        ...(form.odometer !== '' ? { odometer: Number(form.odometer) } : {}),
        ...(form.accessories.trim() ? { accessories: form.accessories.trim() } : {}),
      };
      const saved = isEdit && id
        ? await fleetService.update(id, payload)
        : await fleetService.create(payload);
      setRegisteredId(saved.id);
      for (const file of [...photos, ...videos, ...documents]) {
        const media = new FormData();
        media.append('file', file);
        media.append('kind', file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT');
        media.append('label', file.name);
        await fleetService.uploadDocument(saved.id, media);
      }
      setDirty(false); allowNavigation();
      navigate(`/inventory/vehicles/${saved.id}`);
    } catch (err) {
      const apiError = err as NormalizedApiError;
      if (Array.isArray(apiError.details)) {
        const errors: Record<string, string> = {};
        for (const issue of apiError.details) if (issue && typeof issue.field === 'string' && typeof issue.message === 'string') errors[issue.field.replace(/^receiving\./, '')] = issue.message;
        setFieldErrors(errors);
      }
      setError(apiError.message ?? 'Could not save vehicle. Your changes are still here.');
    } finally {
      setSaving(false);
    }
  };

  const opt = (arr: MasterRecord[]) => arr.map((m) => ({ label: m.name, value: m.id }));

  if (loading) return <Spinner block label="Loading vehicle…" />;

  if (loadFailed) return <ErrorState title="Vehicle could not be loaded" description={error ?? 'Please try again.'}
    action={<Button onClick={() => window.location.reload()}>Retry loading vehicle</Button>} />;

  return (
    <div>
      <PageTitle
        title={isEdit ? 'Edit Vehicle' : 'Register Vehicle'}
        description={isEdit ? 'Update the vehicle record.' : 'Register the car and add it to inventory in one step. Complete the details when the car arrives.'}
        breadcrumbs={[
          { label: 'FleetGo', to: '/dashboard' },
          { label: 'Inventory', to: '/inventory' },
          { label: 'Vehicles', to: '/inventory/vehicles' },
          { label: isEdit ? 'Edit' : 'Register' },
        ]}
      />

      {lookupError ? <p role="alert" className="fg-feedback">Some selection lists could not be loaded. Save your work before reloading this page to try again.</p> : null}
      {registeredId && error ? <p role="status" className="fg-feedback">The vehicle details were saved, but some files could not be uploaded. <Link to={`/inventory/vehicles/${registeredId}/edit`} onClick={() => { setDirty(false); allowNavigation(); }}>Open the registered vehicle</Link> and add the missing files in the registration or edit form. Do not register it again.</p> : null}
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <fieldset disabled={saving} className="fg-form-fieldset">
        {error ? <div className="fg-auth__error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>{error}</div> : null}

        <Card title="Identification">
          <div className="fg-form-grid">
            <FormInput label="Registration number" name="registrationNumber" error={fieldErrors.registrationNumber} value={form.registrationNumber} onChange={(e) => set('registrationNumber')(e.target.value)} required />
            <FormInput label="VIN / Chassis number" name="vin" error={fieldErrors.vin} value={form.vin} onChange={(e) => set('vin')(e.target.value)} hint="11–17 chars, excludes I/O/Q" />
            <FormInput label="Engine number" name="engineNumber" error={fieldErrors.engineNumber} value={form.engineNumber} onChange={(e) => set('engineNumber')(e.target.value)} />
            {isEdit ? null : <div className="fg-form-note">Vehicle ID is generated automatically (FG-VEH-######).</div>}
          </div>
        </Card>

        <Card title="Classification" className="fg-form-section">
          <div className="fg-form-grid">
            <Select label="Make" name="makeId" error={fieldErrors.makeId} value={form.makeId} onChange={(e) => { set('makeId')(e.target.value); set('modelId')(''); }}
              options={[{ label: '—', value: '' }, ...opt(makes)]} />
            <Select label="Model" name="modelId" error={fieldErrors.modelId} value={form.modelId} onChange={(e) => set('modelId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...filteredModels.map((m) => ({ label: m.variant ? `${m.name} (${m.variant})` : m.name, value: m.id }))]} />
            <Select label="Fuel type" name="fuelTypeId" error={fieldErrors.fuelTypeId} value={form.fuelTypeId} onChange={(e) => set('fuelTypeId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(fuels)]} />
            <FormInput label="Manufacturing year" type="number" value={form.manufacturingYear} onChange={(e) => set('manufacturingYear')(e.target.value)} />
            <FormInput label="Color" name="color" error={fieldErrors.color} value={form.color} onChange={(e) => set('color')(e.target.value)} />
          </div>
        </Card>

        <Card title="Assignment & Location" className="fg-form-section">
          <div className="fg-form-grid">
            <Select label="Ownership type" name="ownershipTypeId" error={fieldErrors.ownershipTypeId} value={form.ownershipTypeId} onChange={(e) => set('ownershipTypeId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(ownerships)]} />
            <Select label="Assigned organization" required={!isEdit} name="organizationId" error={fieldErrors.organizationId} value={form.organizationId} onChange={(e) => set('organizationId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...orgs.map((o) => ({ label: `${o.name} (${o.type})`, value: o.id }))]} />
            {isEdit ? <Select label="Current vendor" name="vendorId" error={fieldErrors.vendorId} value={form.vendorId} onChange={(e) => set('vendorId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...vendorOrgs.map((o) => ({ label: o.name, value: o.id }))]} /> : null}
            <Select label="Current depot / location" required={!isEdit} name="depotId" error={fieldErrors.depotId} value={form.depotId} onChange={(e) => set('depotId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(depots)]} />
          </div>
        </Card>

        {!isEdit ? <Card title="Arrival & inventory details" subtitle="These details create the inventory entry automatically. There is no separate receiving step." className="fg-form-section">
          <div className="fg-form-grid">
            <FormInput label="Arrival date and time" type="datetime-local" required value={form.receivedAt} error={fieldErrors.receivedAt} onChange={(e) => set('receivedAt')(e.target.value)} />
            <Select label="Received from organization" required value={form.receivedFromOrgId} error={fieldErrors.receivedFromOrgId} onChange={(e) => set('receivedFromOrgId')(e.target.value)} options={[{label:'Select source organization',value:''},...orgs.map((o)=>({label:o.name,value:o.id}))]} />
            <Select label="Vehicle held by" required value={form.custodianType} onChange={(e) => { set('custodianType')(e.target.value); if (e.target.value !== 'VENDOR') set('vendorId')(''); }} options={[{label:'Current depot',value:'DEPOT'},{label:'Vendor / transport partner',value:'VENDOR'},{label:'Assigned organization',value:'ORGANIZATION'}]} />
            {form.custodianType === 'VENDOR' ? <Select label="Current vendor" required value={form.vendorId} error={fieldErrors.vendorId} onChange={(e)=>set('vendorId')(e.target.value)} options={[{label:'Select vendor',value:''},...vendorOrgs.map((o)=>({label:o.name,value:o.id}))]} /> : null}
            <Select label="Initial condition" required value={form.initialCondition} onChange={(e)=>set('initialCondition')(e.target.value)} options={[{label:'Good',value:'GOOD'},{label:'Damaged',value:'DAMAGED'},{label:'Requires maintenance',value:'MAINTENANCE'}]} />
            <FormInput label="Odometer (km)" type="number" min={0} max={10000000} step={1} value={form.odometer} error={fieldErrors.odometer} onChange={(e)=>set('odometer')(e.target.value)} />
            <FormInput label="Accessories / equipment" value={form.accessories} onChange={(e)=>set('accessories')(e.target.value)} />
          </div>
          <p className="fg-form-note">Good cars at a depot become Available. Vendor-held cars become At Vendor. Damaged or maintenance cars stay unavailable.</p>
        </Card> : null}

        <Card title="Compliance" className="fg-form-section">
          <div className="fg-form-grid">
            <FormInput label="Insurance provider" name="insuranceProvider" error={fieldErrors.insuranceProvider} value={form.insuranceProvider} onChange={(e) => set('insuranceProvider')(e.target.value)} />
            <FormInput label="Insurance policy number" name="insurancePolicyNumber" error={fieldErrors.insurancePolicyNumber} value={form.insurancePolicyNumber} onChange={(e) => set('insurancePolicyNumber')(e.target.value)} />
            <DatePicker label="Insurance expiry" name="insuranceExpiry" error={fieldErrors.insuranceExpiry} value={form.insuranceExpiry} onChange={(e) => set('insuranceExpiry')(e.target.value)} />
            <FormInput label="Registration certificate no." name="registrationCertNumber" error={fieldErrors.registrationCertNumber} value={form.registrationCertNumber} onChange={(e) => set('registrationCertNumber')(e.target.value)} />
            <DatePicker label="Registration expiry" name="registrationExpiry" error={fieldErrors.registrationExpiry} value={form.registrationExpiry} onChange={(e) => set('registrationExpiry')(e.target.value)} />
          </div>
        </Card>

        <Card title="Additional" className="fg-form-section">
          <FormInput label="Remarks" name="remarks" error={fieldErrors.remarks} value={form.remarks} onChange={(e) => set('remarks')(e.target.value)} />
        </Card>

        <Card title="Photos, videos & documents" subtitle="Attach vehicle photos, videos and PDF documents here when registering or updating the car. Up to 100 MB per file." className="fg-form-section">
          <div className="fg-form-grid">
            <label className="fg-vehicle-media"><span>Vehicle photos</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => { setPhotos(Array.from(e.target.files ?? [])); setDirty(true); }} />{photos.length ? <small>{photos.length} photo(s) selected</small> : null}</label>
            <label className="fg-vehicle-media"><span>Vehicle videos</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska" multiple onChange={(e) => { setVideos(Array.from(e.target.files ?? [])); setDirty(true); }} />{videos.length ? <small>{videos.length} video(s) selected</small> : null}</label>
            <label className="fg-vehicle-media"><span>Vehicle documents (PDF)</span><input type="file" accept="application/pdf" multiple onChange={(e) => { setDocuments(Array.from(e.target.files ?? [])); setDirty(true); }} />{documents.length ? <small>{documents.length} document(s) selected</small> : null}</label>
          </div>
          {fieldErrors.media ? <p role="alert" className="fg-auth__error">{fieldErrors.media}</p> : null}
        </Card>

        <div className="fg-form-actions">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!!registeredId}>{isEdit ? 'Save changes' : 'Register vehicle & add to inventory'}</Button>
        </div>
        </fieldset>
      </form>
      <ConfirmDialog open={blocker.state === 'blocked'} title="Discard unsaved changes?"
        message="Your vehicle changes have not been saved. Stay to continue editing, or discard them to leave."
        confirmLabel="Discard changes" cancelLabel="Keep editing" destructive
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
        onCancel={() => blocker.state === 'blocked' && blocker.reset()} />
    </div>
  );
}
