import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { organizationService } from '@/services/organizationService';
import type { Organization } from '@/types/auth';
import type { MasterRecord } from '@/types/vehicle';
import { FleetTabs } from '../components/FleetTabs';
import './VehicleForm.css';

type FormState = Record<string, string>;
const EMPTY: FormState = {
  registrationNumber: '', vin: '', engineNumber: '', makeId: '', modelId: '',
  typeId: '', categoryId: '', fuelTypeId: '', ownershipTypeId: '',
  manufacturingYear: '', color: '', organizationId: '', vendorId: '', depotId: '',
  insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '',
  registrationCertNumber: '', registrationExpiry: '', remarks: '',
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

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
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
  const [types, setTypes] = useState<MasterRecord[]>([]);
  const [categories, setCategories] = useState<MasterRecord[]>([]);
  const [fuels, setFuels] = useState<MasterRecord[]>([]);
  const [ownerships, setOwnerships] = useState<MasterRecord[]>([]);
  const [depots, setDepots] = useState<MasterRecord[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);

  const set = (k: keyof FormState) => (v: string) => {
    setDirty(true); setFieldErrors((errors) => ({ ...errors, [k]: '' }));
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    const opt = { pageSize: 200, active: 'true' as const };
    masterDataService.list('makes', opt).then((r) => setMakes(r.data)).catch(() => setLookupError(true));
    masterDataService.list('models', { pageSize: 200, active: 'true' }).then((r) => setModels(r.data)).catch(() => setLookupError(true));
    masterDataService.list('types', opt).then((r) => {
      setTypes(r.data);
      // All vehicles are cars — default the type to "Car" on a new vehicle.
      if (!id) {
        const car = r.data.find((x) => x.name === 'Car') ?? r.data[0];
        if (car) setForm((f) => (f.typeId ? f : { ...f, typeId: car.id }));
      }
    }).catch(() => setLookupError(true));
    masterDataService.list('categories', opt).then((r) => setCategories(r.data)).catch(() => setLookupError(true));
    masterDataService.list('fuel-types', opt).then((r) => setFuels(r.data)).catch(() => setLookupError(true));
    masterDataService.list('ownership-types', opt).then((r) => setOwnerships(r.data)).catch(() => setLookupError(true));
    masterDataService.list('depots', { pageSize: 200 }).then((r) => setDepots(r.data)).catch(() => setLookupError(true));
    organizationService.list({ pageSize: 200 }).then((r) => setOrgs(r.data)).catch(() => setLookupError(true));
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
    setError(null);
    const invalid: Record<string, string> = {};
    if (!form.registrationNumber.trim()) invalid.registrationNumber = 'Enter a registration number.';
    if (form.vin.trim() && !/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(form.vin.trim())) invalid.vin = 'Use 11?17 letters and numbers, excluding I, O and Q.';
    const year = Number(form.manufacturingYear);
    if (form.manufacturingYear && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1)) invalid.manufacturingYear = `Use a year between 1950 and ${new Date().getFullYear() + 1}.`;
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) { setError('Check the highlighted fields before saving.'); return; }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const saved = isEdit && id
        ? await fleetService.update(id, payload)
        : await fleetService.create(payload);
      setDirty(false); allowNavigation();
      navigate(`/fleet/vehicles/${saved.id}`);
    } catch (err) {
      const apiError = err as NormalizedApiError;
      if (Array.isArray(apiError.details)) {
        const errors: Record<string, string> = {};
        for (const issue of apiError.details) if (issue && typeof issue.field === 'string' && typeof issue.message === 'string') errors[issue.field] = issue.message;
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
        description={isEdit ? 'Update the vehicle record.' : 'Add a new vehicle to the fleet. Only registration number is required.'}
        breadcrumbs={[
          { label: 'FleetGo', to: '/dashboard' },
          { label: 'Fleet', to: '/fleet' },
          { label: 'Vehicles', to: '/fleet/vehicles' },
          { label: isEdit ? 'Edit' : 'Register' },
        ]}
      />
      <FleetTabs />

      {lookupError ? <p role="alert" className="fg-feedback">Some selection lists could not be loaded. Save your work before reloading this page to try again.</p> : null}
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
            <Select label="Type" name="typeId" error={fieldErrors.typeId} value={form.typeId} onChange={(e) => set('typeId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(types)]} />
            <Select label="Category" name="categoryId" error={fieldErrors.categoryId} value={form.categoryId} onChange={(e) => set('categoryId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(categories)]} />
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
            <Select label="Assigned organization" name="organizationId" error={fieldErrors.organizationId} value={form.organizationId} onChange={(e) => set('organizationId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...orgs.map((o) => ({ label: `${o.name} (${o.type})`, value: o.id }))]} />
            <Select label="Current vendor" name="vendorId" error={fieldErrors.vendorId} value={form.vendorId} onChange={(e) => set('vendorId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...vendorOrgs.map((o) => ({ label: o.name, value: o.id }))]} />
            <Select label="Current depot / location" name="depotId" error={fieldErrors.depotId} value={form.depotId} onChange={(e) => set('depotId')(e.target.value)}
              options={[{ label: '—', value: '' }, ...opt(depots)]} />
          </div>
        </Card>

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

        <div className="fg-form-actions">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Save changes' : 'Register vehicle'}</Button>
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
