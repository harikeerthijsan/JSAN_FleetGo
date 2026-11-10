import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  FormInput,
  Icon,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  type BadgeTone,
} from "@/components";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { fleetService } from "@/services/fleetService";
import { claimApi } from "@/services/claimService";
import type { Vehicle } from "@/types/vehicle";
import type {
  ClaimAttachment,
  ClaimDashboard,
  ClaimEvent,
  ClaimLookups,
  InsuranceClaim,
} from "@/types/claim";
import "../Claims.css";

const errText = (e: unknown) => (e as { message?: string })?.message ?? "Request failed.";
const human = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());
const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");
const money = (c: string, n: number | null) => (n === null || n === undefined ? "—" : `${c} ${n.toLocaleString()}`);

const STATUS_TONE: Record<string, BadgeTone> = { OPEN: "warning", WIP: "info", CLOSED: "neutral" };
const INS_TONE: Record<string, BadgeTone> = {
  NOT_SUBMITTED: "neutral", SUBMITTED: "info", UNDER_REVIEW: "warning",
  APPROVED: "success", PARTIALLY_APPROVED: "warning", REJECTED: "danger", SETTLED: "success",
};
const LEVEL_TONE: Record<string, BadgeTone> = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger" };

function useLookups() {
  const [data, setData] = useState<ClaimLookups | null>(null);
  useEffect(() => {
    claimApi.lookups().then(setData).catch(() => setData(null));
  }, []);
  return data;
}

// ---------------------------------------------------------------------------
// List + dashboard
// ---------------------------------------------------------------------------
function ClaimsList({ lookups }: { lookups: ClaimLookups | null }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InsuranceClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [dash, setDash] = useState<ClaimDashboard | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    claimApi
      .list({ status: status || undefined, damageLevel: level || undefined, search: search || undefined }, page, 25)
      .then((r) => { setRows(r.data); setTotal(r.meta.total); setError(""); })
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [status, level, search, page]);
  useEffect(load, [load]);
  useEffect(() => { claimApi.dashboard().then(setDash).catch(() => setDash(null)); }, []);

  return (
    <>
      {dash ? (
        <section aria-label="Claims overview">
          <div className="fg-claim__metrics">
            {([["All claims", dash.total], ["Open", dash.open], ["In progress", dash.wip], ["Closed", dash.closed]] as [string, number][]).map(([l, v], index) => (
              <div key={l} className={`fg-claim__metric fg-claim__metric--${index}`}><span className="fg-claim__metric-label">{l}<Icon name={index === 1 ? 'alert' : index === 3 ? 'fleet' : 'reports'} size={17} /></span><span className="fg-claim__metric-value">{v}</span><span className="fg-claim__metric-caption">{['In your authorized scope', 'Awaiting attention', 'Being processed', 'Completed cases'][index]}</span></div>
            ))}
            <div className="fg-claim__metric fg-claim__metric--payable"><span className="fg-claim__metric-label">Total payable<Icon name="reports" size={17} /></span><span className="fg-claim__metric-value">{dash.totalPayable.toLocaleString()}</span><span className="fg-claim__metric-caption">Recorded claim amounts</span></div>
          </div>
        </section>
      ) : null}
      <Card className="fg-claim__register" title="Claims register" subtitle="Find an incident, review its evidence and follow its progress.">
        <div className="fg-claim__filters">
          <Select label="Status" value={status} options={[{ label: "All", value: "" }, ...(lookups?.statuses ?? []).map((s) => ({ label: human(s), value: s }))]} onChange={(e) => { setStatus(e.target.value); setPage(1); }} />
          <Select label="Damage level" value={level} options={[{ label: "All", value: "" }, ...(lookups?.damageLevels ?? []).map((s) => ({ label: human(s), value: s }))]} onChange={(e) => { setLevel(e.target.value); setPage(1); }} />
          <FormInput label="Search ref / city / reg." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          {lookups?.canReport ? <Link to="/claims/new"><Button variant="primary">Report incident</Button></Link> : null}
        </div>
        <p className="fg-claim__table-hint"><Icon name="chevron-right" size={14} /> Select a row to open the claim and its processing details.</p>
        {error ? <p className="fg-claim__error" role="alert">{error}</p> : null}
        <DataTable
          columns={[
            { key: "reference", header: "Reference", render: (c: InsuranceClaim) => <Link to={`/claims/${c.id}`}>{c.reference}</Link> },
            { key: "vehicle", header: "Vehicle", render: (c: InsuranceClaim) => <span className="fg-claim__vehicle"><Icon name="fleet" size={18} /><span>{c.vehicle?.registrationNumber ?? c.vehicle?.vehicleCode ?? "—"}</span></span> },
            { key: "incident", header: "Incident", render: (c: InsuranceClaim) => human(c.incidentType) },
            { key: "city", header: "City", render: (c: InsuranceClaim) => c.city ?? "—" },
            { key: "level", header: "Damage", render: (c: InsuranceClaim) => <StatusBadge tone={LEVEL_TONE[c.damageLevel]}>{human(c.damageLevel)}</StatusBadge> },
            { key: "ins", header: "Insurance", render: (c: InsuranceClaim) => <StatusBadge tone={INS_TONE[c.insuranceStatus]}>{human(c.insuranceStatus)}</StatusBadge> },
            { key: "status", header: "Status", render: (c: InsuranceClaim) => <StatusBadge tone={STATUS_TONE[c.status]}>{human(c.status)}</StatusBadge> },
            { key: "open", header: "Details", render: (c: InsuranceClaim) => <Link className="fg-claim__open" to={`/claims/${c.id}`} aria-label={`Open claim ${c.reference}`}>View <Icon name="chevron-right" size={14} /></Link> },
          ]}
          rows={rows}
          rowKey={(c: InsuranceClaim) => c.id}
          onRowClick={(claim) => navigate(`/claims/${claim.id}`)}
          loading={loading}
          emptyTitle="No claims"
          emptyDescription="No insurance claims match the filters."
        />
        <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Report form
// ---------------------------------------------------------------------------
function ReportForm({ lookups }: { lookups: ClaimLookups | null }) {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState({ vehicleId: "", incidentType: "ACCIDENT", category: "", city: "", location: "", incidentDate: "", damageLevel: "MEDIUM", description: "", policeComplaint: false, policeComplaintNumber: "", policeStation: "" });
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { fleetService.list({ pageSize: 200 }).then((r) => setVehicles(r.data)).catch(() => undefined); }, []);

  const requiredFields = [form.vehicleId, form.incidentType, form.damageLevel, form.category, form.city, form.location, form.incidentDate];
  const complete = requiredFields.every((value) => value.trim().length > 0) && form.description.trim().length >= 3 && photos.length > 0 && videos.length > 0;

  const submit = async () => {
    if (!complete || busy) { setError("Complete every incident field and select at least one photo and one video. Police information is optional."); return; }
    if ([...photos, ...videos].length > 10 || [...photos, ...videos].reduce((total, file) => total + file.size, 0) > 104_857_600) { setError("Select up to 10 files totalling 100 MB or less."); return; }
    setBusy(true); setError("");
    try {
      const body: Record<string, unknown> = {
        vehicleId: form.vehicleId, incidentType: form.incidentType, damageLevel: form.damageLevel,
        description: form.description, policeComplaint: form.policeComplaint,
      };
      for (const k of ["category", "city", "location", "incidentDate", "policeComplaintNumber", "policeStation"] as const)
        if (form[k]) body[k] = form[k];
      const claim = await claimApi.create(body, photos, videos);
      navigate(`/claims/${claim.id}`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="fg-claim__report" title="Report a vehicle incident" subtitle="Record the incident and add the evidence needed for review.">
      <div className="fg-claim__section-heading"><span>01</span><div><h2>Incident details</h2><p>Choose the car and describe where and when the incident happened.</p></div></div>
      <div className="fg-claim__form">
        <Select label="Vehicle" required value={form.vehicleId} options={[{ label: "Select vehicle", value: "" }, ...vehicles.map((v) => ({ label: `${v.vehicleCode} — ${v.registrationNumber ?? ""}`, value: v.id }))]} onChange={(e) => set("vehicleId", e.target.value)} />
        <Select label="Incident type" required value={form.incidentType} options={(lookups?.incidentTypes ?? ["ACCIDENT"]).map((t) => ({ label: human(t), value: t }))} onChange={(e) => set("incidentType", e.target.value)} />
        <Select label="Damage level" required value={form.damageLevel} options={(lookups?.damageLevels ?? ["LOW", "MEDIUM", "HIGH"]).map((t) => ({ label: human(t), value: t }))} onChange={(e) => set("damageLevel", e.target.value)} />
        <FormInput label="Category" required value={form.category} onChange={(e) => set("category", e.target.value)} />
        <FormInput label="City" required value={form.city} onChange={(e) => set("city", e.target.value)} />
        <FormInput label="Location / landmark" required value={form.location} onChange={(e) => set("location", e.target.value)} />
        <FormInput label="Incident date" required type="date" value={form.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} />
      </div>
      <FormInput label="What happened?" value={form.description} minLength={3} onChange={(e) => set("description", e.target.value)} required />

      <div className="fg-claim__section-heading"><span>02</span><div><h2>Police information <small>(optional)</small></h2><p>Add complaint details if a report has been filed.</p></div></div>
      <div className="fg-claim__form" style={{ marginTop: "0.75rem" }}>
        <label className="fg-claim__check"><input type="checkbox" checked={form.policeComplaint} onChange={(e) => set("policeComplaint", e.target.checked)} /> Police complaint filed</label>
        {form.policeComplaint ? <FormInput label="Complaint / FIR number" value={form.policeComplaintNumber} onChange={(e) => set("policeComplaintNumber", e.target.value)} /> : null}
        {form.policeComplaint ? <FormInput label="Police station" value={form.policeStation} onChange={(e) => set("policeStation", e.target.value)} /> : null}
      </div>

      <div className="fg-claim__section-heading"><span>03</span><div><h2>Supporting evidence</h2><p>At least one photo and one video are required. Up to 10 files, 100 MB total.</p></div></div>
      <div className="fg-claim__form">
        <label className="fg-claim__file"><span>Photos of damage <span className="fg-field__required">*</span></span><input required type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />{photos.length ? <small>{photos.length} selected</small> : null}</label>
        <label className="fg-claim__file"><span>Videos of damage <span className="fg-field__required">*</span></span><input required type="file" accept="video/*" multiple onChange={(e) => setVideos(Array.from(e.target.files ?? []))} />{videos.length ? <small>{videos.length} selected</small> : null}</label>
      </div>

      <p className="fg-claim__metric-label">All fields marked * are required. Police complaint information is optional.</p>
      {error ? <p className="fg-claim__error" role="alert">{error}</p> : null}
      <div className="fg-claim__actions">
        <Button variant="primary" loading={busy} disabled={!complete || busy} onClick={submit}>Submit report</Button>
        <Button variant="ghost" onClick={() => navigate("/claims")}>Cancel</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Evidence thumbnail (fetches the authenticated blob)
// ---------------------------------------------------------------------------
function EvidenceThumb({ claimId, att }: { claimId: string; att: ClaimAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    import("@/services/apiClient").then(({ apiClient }) =>
      apiClient.get(`/claims/${claimId}/attachments/${att.id}/download`, { responseType: "blob" }).then((r) => {
        const u = URL.createObjectURL(r.data as Blob);
        revoke = u;
        setUrl(u);
      }).catch(() => undefined),
    );
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [claimId, att.id]);
  return (
    <div className="fg-claim__thumb">
      {url ? (att.kind === "VIDEO" ? <video src={url} controls /> : att.kind === "PHOTO" ? <img src={url} alt={att.fileName} /> : null) : <div style={{ height: 100, display: "grid", placeItems: "center" }}><Spinner /></div>}
      <div className="fg-claim__thumb-meta">
        <span>{att.kind}</span>
        <button className="fg-claim__linkbtn" style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0, textAlign: "left" }} onClick={() => claimApi.downloadEvidence(claimId, att.id, att.fileName)}>Download</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function ClaimDetail({ lookups }: { lookups: ClaimLookups | null }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [claim, setClaim] = useState<InsuranceClaim | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const canManage = !!lookups?.canManage;

  const load = useCallback(() => { claimApi.getById(id).then(setClaim).catch((e) => setError(errText(e))); }, [id]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(""); setMsg("");
    try { await fn(); setMsg(ok); load(); } catch (e) { setError(errText(e)); }
  };

  if (error && !claim) return <Card title="Claim"><p className="fg-claim__error" role="alert">{error}</p><Link to="/claims">Back to claims</Link></Card>;
  if (!claim) return <Spinner block label="Loading claim…" />;

  return (
    <>
      <div className="fg-claim__detail-grid">
      <Card className="fg-claim__incident" title={claim.reference} subtitle={<><StatusBadge tone={STATUS_TONE[claim.status]}>{human(claim.status)}</StatusBadge> · <StatusBadge tone={INS_TONE[claim.insuranceStatus]}>{human(claim.insuranceStatus)}</StatusBadge></>}>
        {msg ? <p className="fg-claim__ok">{msg}</p> : null}
        {error ? <p className="fg-claim__error" role="alert">{error}</p> : null}
        <dl className="fg-claim__kv">
          <dt>Vehicle</dt><dd>{claim.vehicle?.registrationNumber ?? claim.vehicle?.vehicleCode ?? claim.vehicleId}</dd>
          <dt>Incident</dt><dd>{human(claim.incidentType)}{claim.category ? ` · ${claim.category}` : ""}</dd>
          <dt>Damage level</dt><dd><StatusBadge tone={LEVEL_TONE[claim.damageLevel]}>{human(claim.damageLevel)}</StatusBadge></dd>
          <dt>Where</dt><dd>{[claim.city, claim.location].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>When</dt><dd>{claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "—"}</dd>
          <dt>Description</dt><dd>{claim.description}</dd>
          <dt>Police complaint</dt><dd>{claim.policeComplaint ? `Yes${claim.policeComplaintNumber ? ` · ${claim.policeComplaintNumber}` : ""}${claim.policeStation ? ` · ${claim.policeStation}` : ""}` : "No"}</dd>
          <dt>Acknowledged</dt><dd>{claim.acknowledged ? dt(claim.acknowledgedAt) : "Not yet"}</dd>
        </dl>
      </Card>

      <Card className="fg-claim__evidence" title="Damage evidence" subtitle="Photos and videos attached to this incident.">
        {claim.attachments && claim.attachments.length ? (
          <div className="fg-claim__gallery">
            {claim.attachments.map((a) => <EvidenceThumb key={a.id} claimId={claim.id} att={a} />)}
          </div>
        ) : <p className="fg-claim__metric-label">No photos or videos attached.</p>}
        {lookups?.canReport && claim.status !== "CLOSED" ? (
          <div className="fg-claim__form" style={{ marginTop: "0.75rem" }}>
            <label className="fg-claim__file"><span>Add photo/video</span>
              <input type="file" accept="image/*,video/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await act(() => claimApi.uploadEvidence(claim.id, f), "Evidence added."); }} />
            </label>
          </div>
        ) : null}
      </Card>

      <Card className="fg-claim__processing" title="Insurance processing" subtitle={canManage ? "Acknowledge receipt, record insurer updates and save the outcome." : "Insurer details and the latest recorded outcome."}>
        <dl className="fg-claim__kv">
          <dt>Insurer</dt><dd>{claim.insurerName ?? "—"}</dd>
          <dt>Policy / claim ref</dt><dd>{[claim.policyNumber, claim.insurerClaimRef].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Estimated damage</dt><dd>{money(claim.currency, claim.estimatedAmount)}</dd>
          <dt>Approved</dt><dd>{claim.approvedPercentage === null ? "—" : `${claim.approvedPercentage}%`}</dd>
          <dt>Payable</dt><dd>{money(claim.currency, claim.payableAmount)}</dd>
        </dl>
        {canManage ? <ProcessPanel claim={claim} lookups={lookups} onDone={(m) => act(async () => {}, m)} reload={load} /> : null}
      </Card>

      <Card className="fg-claim__history" title="Claim activity" subtitle="A chronological record of updates.">
        <ul className="fg-claim__timeline">
          {(claim.events ?? []).map((e: ClaimEvent) => (
            <li key={e.id}><time>{dt(e.createdAt)}</time><span>{e.note ?? human(e.type)}</span></li>
          ))}
          {!claim.events?.length ? <li>No activity recorded yet.</li> : null}
        </ul>
      </Card>
      </div>

      <Button variant="ghost" onClick={() => navigate("/claims")}>← Back to claims</Button>
    </>
  );
}

function ProcessPanel({ claim, lookups, onDone, reload }: { claim: InsuranceClaim; lookups: ClaimLookups | null; onDone: (m: string) => void; reload: () => void }) {
  const [form, setForm] = useState({
    status: claim.status,
    insuranceStatus: claim.insuranceStatus,
    insurerName: claim.insurerName ?? "",
    policyNumber: claim.policyNumber ?? "",
    insurerClaimRef: claim.insurerClaimRef ?? "",
    estimatedAmount: claim.estimatedAmount?.toString() ?? "",
    approvedPercentage: claim.approvedPercentage?.toString() ?? "",
    payableAmount: claim.payableAmount?.toString() ?? "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setError("");
    try {
      const body: Record<string, unknown> = { status: form.status, insuranceStatus: form.insuranceStatus };
      if (form.insurerName) body.insurerName = form.insurerName;
      if (form.policyNumber) body.policyNumber = form.policyNumber;
      if (form.insurerClaimRef) body.insurerClaimRef = form.insurerClaimRef;
      if (form.estimatedAmount) body.estimatedAmount = Number(form.estimatedAmount);
      if (form.approvedPercentage) body.approvedPercentage = Number(form.approvedPercentage);
      if (form.payableAmount) body.payableAmount = Number(form.payableAmount);
      if (form.note) body.note = form.note;
      await claimApi.process(claim.id, body);
      onDone("Claim updated.");
      reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fg-claim__process-panel">
      {!claim.acknowledged ? (
        <div className="fg-claim__actions">
          <p className="fg-claim__ack-hint">Confirm that this incident has been received for review.</p>
          <Button variant="secondary" onClick={async () => { await claimApi.acknowledge(claim.id); reload(); }}>Acknowledge receipt</Button>
        </div>
      ) : null}
      <div className="fg-claim__form">
        <Select label="Status" value={form.status} options={(lookups?.statuses ?? ["OPEN", "WIP", "CLOSED"]).map((s) => ({ label: human(s), value: s }))} onChange={(e) => set("status", e.target.value as InsuranceClaim["status"])} />
        <Select label="Insurance status" value={form.insuranceStatus} options={(lookups?.insuranceStatuses ?? []).map((s) => ({ label: human(s), value: s }))} onChange={(e) => set("insuranceStatus", e.target.value as InsuranceClaim["insuranceStatus"])} />
        <FormInput label="Insurer name" value={form.insurerName} onChange={(e) => set("insurerName", e.target.value)} />
        <FormInput label="Policy number" value={form.policyNumber} onChange={(e) => set("policyNumber", e.target.value)} />
        <FormInput label="Insurer claim ref" value={form.insurerClaimRef} onChange={(e) => set("insurerClaimRef", e.target.value)} />
      </div>
      <div className="fg-claim__pay">
        <FormInput label={`Estimated damage (${claim.currency})`} type="number" value={form.estimatedAmount} onChange={(e) => set("estimatedAmount", e.target.value)} />
        <FormInput label="Approved %" type="number" value={form.approvedPercentage} onChange={(e) => set("approvedPercentage", e.target.value)} />
        <FormInput label={`Payable (${claim.currency})`} type="number" value={form.payableAmount} onChange={(e) => set("payableAmount", e.target.value)} />
      </div>
      <FormInput label="Note (optional)" value={form.note} onChange={(e) => set("note", e.target.value)} />
      {error ? <p className="fg-claim__error" role="alert">{error}</p> : null}
      <div className="fg-claim__actions"><Button variant="primary" loading={busy} onClick={save}>Save processing</Button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module shell
// ---------------------------------------------------------------------------
export function ClaimsPage() {
  useDocumentTitle("Insurance Claims");
  const lookups = useLookups();
  return (
    <div className="fg-claim">
      <PageTitle title="Insurance Claims" description="Report vehicle incidents with evidence and track them through to settlement." />
      <Routes>
        <Route index element={<ClaimsList lookups={lookups} />} />
        <Route path="new" element={<ReportForm lookups={lookups} />} />
        <Route path=":id" element={<ClaimDetail lookups={lookups} />} />
      </Routes>
    </div>
  );
}
