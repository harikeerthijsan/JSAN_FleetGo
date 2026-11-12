import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  FormInput,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  type BadgeTone,
} from "@/components";
import { useAppConfig } from "@/context/AppConfigContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { vendorApi } from "@/services/vendorService";
import type {
  VendorContact,
  VendorDetail,
  VendorDisk,
  VendorDocument,
  VendorDocumentCategory,
  VendorListItem,
  VendorLocation,
  VendorLookups,
  VendorUser,
  VendorVehicle,
} from "@/types/vendor";
import "../Vendors.css";

const errText = (e: unknown) => (e as { message?: string })?.message ?? "Request failed.";
const human = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());
const typeLabel: Record<string, string> = { VEHICLE_VENDOR: "Vehicle vendor", TRANSPORT_PARTNER: "Transport partner" };
const statusTone = (s: string): BadgeTone => (s === "ACTIVE" ? "success" : "neutral");

function useLookups() {
  const [data, setData] = useState<VendorLookups | null>(null);
  useEffect(() => {
    vendorApi.lookups().then(setData).catch(() => setData(null));
  }, []);
  return data;
}

// ---------------------------------------------------------------------------
// List + register
// ---------------------------------------------------------------------------
function VendorsList({ lookups }: { lookups: VendorLookups | null }) {
  const { defaultPageSize } = useAppConfig();
  const [rows, setRows] = useState<VendorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    vendorApi
      .list({ type: type || undefined, status: status || undefined, search: search || undefined }, page, defaultPageSize)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [type, status, search, page, defaultPageSize]);
  useEffect(load, [load]);

  return (
    <Card title="Vendors & transport partners" subtitle="Organizations that receive, hold or transport fleet and media.">
      <div className="fg-vendor__filters">
        <Select
          label="Type"
          value={type}
          options={[{ label: "All types", value: "" }, { label: "Vehicle vendor", value: "VEHICLE_VENDOR" }, { label: "Transport partner", value: "TRANSPORT_PARTNER" }]}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
        />
        <Select
          label="Status"
          value={status}
          options={[{ label: "All", value: "" }, { label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }]}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        />
        <FormInput label="Search name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {lookups?.canManage ? <Button variant="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Register vendor"}</Button> : null}
      </div>
      {showForm && lookups?.canManage ? <RegisterForm onDone={() => { setShowForm(false); load(); }} /> : null}
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (r: VendorListItem) => r.vendorProfile?.code ?? "—" },
          { key: "name", header: "Vendor", render: (r: VendorListItem) => <Link to={`/vendors/${r.id}`}>{r.name}</Link> },
          { key: "type", header: "Type", render: (r: VendorListItem) => typeLabel[r.type] ?? r.type },
          { key: "category", header: "Category", render: (r: VendorListItem) => r.vendorProfile?.category ?? "—" },
          { key: "contact", header: "Contact", render: (r: VendorListItem) => r.contactEmail ?? r.contactName ?? "—" },
          { key: "users", header: "Users", render: (r: VendorListItem) => r._count?.users ?? "—" },
          { key: "status", header: "Status", render: (r: VendorListItem) => <StatusBadge tone={statusTone(r.status)}>{human(r.status)}</StatusBadge> },
        ]}
        rows={rows}
        rowKey={(r: VendorListItem) => r.id}
        loading={loading}
        emptyTitle="No vendors"
        emptyDescription="No vendors or transport partners match the filters."
      />
      <Pagination page={page} pageSize={defaultPageSize} total={total} onPageChange={setPage} />
    </Card>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", type: "VEHICLE_VENDOR", contactName: "", contactEmail: "", contactPhone: "", registrationNumber: "", category: "", city: "", region: "", notes: "" });
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, string> = { name: form.name, type: form.type };
      for (const k of ["contactName", "contactEmail", "contactPhone", "registrationNumber", "category", "city", "region", "notes"] as const)
        if (form[k]) body[k] = form[k];
      const created = await vendorApi.register(body);
      // Upload any documents chosen on the form against the new vendor.
      if (consentFile) await vendorApi.uploadDocument(created.id, consentFile, "CONSENT");
      for (const f of otherFiles) await vendorApi.uploadDocument(created.id, f, "OTHER");
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="fg-vendor__form">
        <FormInput label="Name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        <Select label="Type" value={form.type} options={[{ label: "Vehicle vendor", value: "VEHICLE_VENDOR" }, { label: "Transport partner", value: "TRANSPORT_PARTNER" }]} onChange={(e) => set("type", e.target.value)} />
        <FormInput label="Category" value={form.category} onChange={(e) => set("category", e.target.value)} />
        <FormInput label="Registration no." value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} />
        <FormInput label="Contact name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        <FormInput label="Contact email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        <FormInput label="Contact phone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        <FormInput label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
        <FormInput label="Region" value={form.region} onChange={(e) => set("region", e.target.value)} />
        <FormInput label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="fg-vendor__form">
        <label className="fg-vendor__file">
          <span>Consent form (PDF/image)</span>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setConsentFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="fg-vendor__file">
          <span>Other documents (agreements, etc.)</span>
          <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setOtherFiles(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      <Button variant="primary" loading={busy} disabled={form.name.trim().length < 2} onClick={submit}>Register vendor</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function VendorDetailPage({ lookups }: { lookups: VendorLookups | null }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const canManage = !!lookups?.canManage;

  const load = useCallback(() => {
    vendorApi.getById(id).then(setVendor).catch((e) => setError(errText(e)));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(""); setMsg("");
    try { await fn(); setMsg(ok); load(); } catch (e) { setError(errText(e)); }
  };

  if (error && !vendor) return <Card title="Vendor"><p className="fg-vendor__error" role="alert">{error}</p><Link to="/vendors">Back to vendors</Link></Card>;
  if (!vendor) return <Spinner block label="Loading vendor…" />;

  const s = vendor.summary;
  const metrics: [string, number][] = [
    ["Assigned vehicles", s.assignedVehicles],
    ["Vehicles in custody", s.custodyVehicles],
    ["Disks in custody", s.disksInCustody],
    ["Allocations", s.allocations],
    ["Dispatches", s.dispatches],
    ["Inspections", s.inspections],
    ["Open tickets", s.openTickets],
    ["Users", s.users],
  ];

  return (
    <>
      <Card
        title={`${vendor.name}`}
        subtitle={<><StatusBadge tone={statusTone(vendor.status)}>{human(vendor.status)}</StatusBadge> · {typeLabel[vendor.type] ?? vendor.type} · {vendor.vendorProfile?.code ?? "—"}</>}
      >
        {msg ? <p className="fg-vendor__ok">{msg}</p> : null}
        {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
        <div className="fg-vendor__metrics">
          {metrics.map(([label, value]) => (
            <div key={label} className="fg-vendor__metric">
              <span className="fg-vendor__metric-value">{value}</span>
              <span className="fg-vendor__metric-label">{label}</span>
            </div>
          ))}
        </div>
        <dl className="fg-vendor__kv" style={{ marginTop: "1rem" }}>
          <dt>Category</dt><dd>{vendor.vendorProfile?.category ?? "—"}</dd>
          <dt>Registration</dt><dd>{vendor.vendorProfile?.registrationNumber ?? "—"}</dd>
          <dt>Contact</dt><dd>{[vendor.contactName, vendor.contactEmail, vendor.contactPhone].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Address</dt><dd>{[vendor.vendorProfile?.addressLine, vendor.vendorProfile?.city, vendor.vendorProfile?.region].filter(Boolean).join(", ") || "—"}</dd>
          <dt>Notes</dt><dd>{vendor.vendorProfile?.notes ?? "—"}</dd>
        </dl>
        {canManage ? (
          <div className="fg-vendor__actions">
            <EditProfile vendor={vendor} onDone={(m) => { setMsg(m); setError(""); }} reload={load} />
            {vendor.status === "ACTIVE" ? (
              <Button variant="danger" onClick={() => { const reason = window.prompt("Reason for deactivation:"); if (reason) act(() => vendorApi.setStatus(id, "INACTIVE", reason), "Vendor deactivated."); }}>Deactivate</Button>
            ) : (
              <Button variant="primary" onClick={() => act(() => vendorApi.setStatus(id, "ACTIVE", "Reactivated"), "Vendor reactivated.")}>Reactivate</Button>
            )}
          </div>
        ) : null}
      </Card>

      <ContactsCard vendor={vendor} canManage={canManage} reload={load} />
      <LocationsCard vendor={vendor} canManage={canManage} reload={load} />
      <DocumentsCard vendor={vendor} canManage={canManage} reload={load} />
      <UsersCard vendor={vendor} canManage={canManage} reload={load} />
      <VehiclesCard id={id} />
      <DisksCard id={id} />

      <Button variant="ghost" onClick={() => navigate("/vendors")}>← Back to vendors</Button>
    </>
  );
}

function EditProfile({ vendor, onDone, reload }: { vendor: VendorDetail; onDone: (m: string) => void; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: vendor.name,
    category: vendor.vendorProfile?.category ?? "",
    registrationNumber: vendor.vendorProfile?.registrationNumber ?? "",
    contactEmail: vendor.contactEmail ?? "",
    contactPhone: vendor.contactPhone ?? "",
    notes: vendor.vendorProfile?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Edit profile</Button>;
  const save = async () => {
    setBusy(true); setError("");
    try {
      await vendorApi.update(vendor.id, form);
      setOpen(false);
      onDone("Vendor profile updated.");
      reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ width: "100%" }}>
      <div className="fg-vendor__form">
        <FormInput label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <FormInput label="Category" value={form.category} onChange={(e) => set("category", e.target.value)} />
        <FormInput label="Registration no." value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} />
        <FormInput label="Contact email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        <FormInput label="Contact phone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        <FormInput label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      <div className="fg-vendor__actions">
        <Button variant="primary" loading={busy} onClick={save}>Save</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function ContactsCard({ vendor, canManage, reload }: { vendor: VendorDetail; canManage: boolean; reload: () => void }) {
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "", isPrimary: false });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const add = async () => {
    setError("");
    try {
      await vendorApi.addContact(vendor.id, { ...form, title: form.title || undefined, email: form.email || undefined, phone: form.phone || undefined });
      setForm({ name: "", title: "", email: "", phone: "", isPrimary: false });
      setShow(false);
      reload();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Contacts" actions={canManage ? <Button variant="secondary" size="sm" onClick={() => setShow((v) => !v)}>{show ? "Close" : "Add contact"}</Button> : undefined}>
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      {show && canManage ? (
        <div>
          <div className="fg-vendor__form">
            <FormInput label="Name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
            <FormInput label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            <FormInput label="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <FormInput label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            <label className="fg-vendor__check"><input type="checkbox" checked={form.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} /> Primary</label>
          </div>
          <Button variant="primary" disabled={!form.name} onClick={add}>Add</Button>
        </div>
      ) : null}
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (c: VendorContact) => <>{c.name}{c.isPrimary ? " ★" : ""}</> },
          { key: "title", header: "Title", render: (c: VendorContact) => c.title ?? "—" },
          { key: "email", header: "Email", render: (c: VendorContact) => c.email ?? "—" },
          { key: "phone", header: "Phone", render: (c: VendorContact) => c.phone ?? "—" },
          { key: "actions", header: "", render: (c: VendorContact) => canManage ? <Button variant="ghost" size="sm" onClick={async () => { await vendorApi.deleteContact(vendor.id, c.id); reload(); }}>Remove</Button> : null },
        ]}
        rows={vendor.vendorContacts}
        rowKey={(c: VendorContact) => c.id}
        emptyTitle="No contacts"
      />
    </Card>
  );
}

function LocationsCard({ vendor, canManage, reload }: { vendor: VendorDetail; canManage: boolean; reload: () => void }) {
  const [form, setForm] = useState({ label: "", city: "", region: "", contactName: "", contactPhone: "", isPrimary: false });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const add = async () => {
    setError("");
    try {
      await vendorApi.addLocation(vendor.id, { ...form, city: form.city || undefined, region: form.region || undefined, contactName: form.contactName || undefined, contactPhone: form.contactPhone || undefined });
      setForm({ label: "", city: "", region: "", contactName: "", contactPhone: "", isPrimary: false });
      setShow(false);
      reload();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Locations" actions={canManage ? <Button variant="secondary" size="sm" onClick={() => setShow((v) => !v)}>{show ? "Close" : "Add location"}</Button> : undefined}>
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      {show && canManage ? (
        <div>
          <div className="fg-vendor__form">
            <FormInput label="Label" required value={form.label} onChange={(e) => set("label", e.target.value)} />
            <FormInput label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            <FormInput label="Region" value={form.region} onChange={(e) => set("region", e.target.value)} />
            <FormInput label="Contact name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            <FormInput label="Contact phone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
            <label className="fg-vendor__check"><input type="checkbox" checked={form.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} /> Primary</label>
          </div>
          <Button variant="primary" disabled={!form.label} onClick={add}>Add</Button>
        </div>
      ) : null}
      <DataTable
        columns={[
          { key: "label", header: "Label", render: (l: VendorLocation) => <>{l.label}{l.isPrimary ? " ★" : ""}</> },
          { key: "city", header: "City", render: (l: VendorLocation) => l.city ?? "—" },
          { key: "region", header: "Region", render: (l: VendorLocation) => l.region ?? "—" },
          { key: "contact", header: "Contact", render: (l: VendorLocation) => [l.contactName, l.contactPhone].filter(Boolean).join(" · ") || "—" },
          { key: "actions", header: "", render: (l: VendorLocation) => canManage ? <Button variant="ghost" size="sm" onClick={async () => { await vendorApi.deleteLocation(vendor.id, l.id); reload(); }}>Remove</Button> : null },
        ]}
        rows={vendor.vendorLocations}
        rowKey={(l: VendorLocation) => l.id}
        emptyTitle="No locations"
      />
    </Card>
  );
}

const DOC_CAT_LABEL: Record<string, string> = { CONSENT: "Consent form", AGREEMENT: "Agreement", OTHER: "Other" };
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function DocumentsCard({ vendor, canManage, reload }: { vendor: VendorDetail; canManage: boolean; reload: () => void }) {
  const [category, setCategory] = useState<VendorDocumentCategory>("AGREEMENT");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await vendorApi.uploadDocument(vendor.id, file, category);
      setFile(null);
      reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Documents" subtitle="Agreements, consent forms and supporting files.">
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      {canManage ? (
        <div className="fg-vendor__form">
          <Select
            label="Type"
            value={category}
            options={[{ label: "Agreement", value: "AGREEMENT" }, { label: "Consent form", value: "CONSENT" }, { label: "Other", value: "OTHER" }]}
            onChange={(e) => setCategory(e.target.value as VendorDocumentCategory)}
          />
          <label className="fg-vendor__file">
            <span>File (PDF/image)</span>
            <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button variant="primary" loading={busy} disabled={!file} onClick={upload}>Upload</Button>
        </div>
      ) : null}
      <DataTable
        columns={[
          { key: "title", header: "Title", render: (d: VendorDocument) => d.title },
          { key: "category", header: "Type", render: (d: VendorDocument) => DOC_CAT_LABEL[d.category] ?? d.category },
          { key: "size", header: "Size", render: (d: VendorDocument) => fmtSize(d.size) },
          { key: "uploaded", header: "Uploaded", render: (d: VendorDocument) => new Date(d.createdAt).toLocaleDateString() },
          {
            key: "actions",
            header: "",
            render: (d: VendorDocument) => (
              <>
                <Button variant="ghost" size="sm" onClick={() => vendorApi.downloadDocument(vendor.id, d.id, d.fileName)}>Download</Button>
                {canManage ? <Button variant="ghost" size="sm" onClick={async () => { await vendorApi.deleteDocument(vendor.id, d.id); reload(); }}>Remove</Button> : null}
              </>
            ),
          },
        ]}
        rows={vendor.vendorDocuments}
        rowKey={(d: VendorDocument) => d.id}
        emptyTitle="No documents"
        emptyDescription="No agreements or consent forms uploaded yet."
      />
    </Card>
  );
}

function UsersCard({ vendor, canManage, reload }: { vendor: VendorDetail; canManage: boolean; reload: () => void }) {
  const [error, setError] = useState("");
  const assign = async () => {
    const userId = window.prompt("User id to assign to this vendor:");
    if (!userId) return;
    setError("");
    try {
      await vendorApi.assignUser(vendor.id, userId.trim());
      reload();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Assigned users" actions={canManage ? <Button variant="secondary" size="sm" onClick={assign}>Assign user</Button> : undefined}>
      {error ? <p className="fg-vendor__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (u: VendorUser) => u.fullName },
          { key: "email", header: "Email", render: (u: VendorUser) => u.email },
          { key: "role", header: "Role", render: (u: VendorUser) => u.role?.displayName ?? "—" },
          { key: "status", header: "Status", render: (u: VendorUser) => <StatusBadge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{human(u.status)}</StatusBadge> },
          { key: "actions", header: "", render: (u: VendorUser) => canManage ? <Button variant="ghost" size="sm" onClick={async () => { await vendorApi.unassignUser(vendor.id, u.id); reload(); }}>Unassign</Button> : null },
        ]}
        rows={vendor.users}
        rowKey={(u: VendorUser) => u.id}
        emptyTitle="No assigned users"
      />
    </Card>
  );
}

function VehiclesCard({ id }: { id: string }) {
  const [rows, setRows] = useState<VendorVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    vendorApi.vehicles(id, page, 10).then((r) => { setRows(r.data); setTotal(r.meta.total); }).finally(() => setLoading(false));
  }, [id, page]);
  return (
    <Card title="Vehicles (assigned or in custody)">
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (v: VendorVehicle) => <Link to={`/inventory/vehicles/${v.id}`}>{v.vehicleCode}</Link> },
          { key: "reg", header: "Registration", render: (v: VendorVehicle) => v.registrationNumber ?? "—" },
          { key: "status", header: "Status", render: (v: VendorVehicle) => human(v.status) },
          { key: "rel", header: "Relationship", render: (v: VendorVehicle) => (v.vendorId === id ? "In custody" : "Assigned") },
        ]}
        rows={rows}
        rowKey={(v: VendorVehicle) => v.id}
        loading={loading}
        emptyTitle="No vehicles"
      />
      <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} />
    </Card>
  );
}

function DisksCard({ id }: { id: string }) {
  const [rows, setRows] = useState<VendorDisk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    vendorApi.disks(id, page, 10).then((r) => { setRows(r.data); setTotal(r.meta.total); }).finally(() => setLoading(false));
  }, [id, page]);
  return (
    <Card title="Disks in custody">
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (d: VendorDisk) => <Link to={`/disk-logistics/disks/${d.id}`}>{d.diskCode}</Link> },
          { key: "serial", header: "Serial", render: (d: VendorDisk) => d.serialNumber },
          { key: "media", header: "Media", render: (d: VendorDisk) => d.mediaType },
          { key: "status", header: "Status", render: (d: VendorDisk) => human(d.status) },
        ]}
        rows={rows}
        rowKey={(d: VendorDisk) => d.id}
        loading={loading}
        emptyTitle="No disks in custody"
      />
      <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Module shell
// ---------------------------------------------------------------------------
export function VendorsPage() {
  useDocumentTitle("Vendor management");
  const lookups = useLookups();
  return (
    <div className="fg-vendor">
      <PageTitle title="Vendor management" description="Vendors and transport partners — profiles, contacts, locations, users and the fleet/media they hold." />
      <Routes>
        <Route index element={<VendorsList lookups={lookups} />} />
        <Route path=":id" element={<VendorDetailPage lookups={lookups} />} />
      </Routes>
    </div>
  );
}
