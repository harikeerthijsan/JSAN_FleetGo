import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  FormInput,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  type BadgeTone,
} from "@/components";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { diskApi } from "@/services/diskService";
import type {
  Disk,
  DiskCustody,
  DiskDashboard,
  DiskDiscrepancy,
  DiskLookups,
  DiskMovement,
  DiskReconciliation,
  DiskShipment,
  DiskShipmentItem,
} from "@/types/disk";
import "../DiskLogistics.css";

const errText = (e: unknown) => (e as { message?: string })?.message ?? "Request failed.";
const human = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());
const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");

const TONES: Record<string, BadgeTone> = {
  AVAILABLE: "success",
  DELIVERED: "success",
  RESOLVED: "success",
  CLOSED: "success",
  APPROVED: "success",
  RECEIVED: "info",
  RESERVED: "info",
  PACKED: "info",
  PLANNED: "info",
  READY: "info",
  SUBMITTED: "info",
  DISPATCHED: "warning",
  IN_TRANSIT: "warning",
  UNDER_INSPECTION: "warning",
  UNDER_REVIEW: "warning",
  REPORTED: "warning",
  DRAFT: "warning",
  AT_VENDOR: "neutral",
  RETURNED: "neutral",
  INACTIVE: "neutral",
  CANCELLED: "neutral",
  PENDING: "neutral",
  DAMAGED: "danger",
  LOST: "danger",
  EXCEPTION: "danger",
  CONFIRMED: "danger",
  DISPUTED: "danger",
  REJECTED: "danger",
  MISSING: "danger",
};
const Badge = ({ value }: { value: string }) => <StatusBadge tone={TONES[value] ?? "neutral"}>{human(value)}</StatusBadge>;

function useLookups() {
  const [data, setData] = useState<DiskLookups | null>(null);
  useEffect(() => {
    diskApi.lookups().then(setData).catch(() => setData(null));
  }, []);
  return data;
}

const depotName = (l: DiskLookups | null, id?: string | null) =>
  (id && l?.depots.find((d) => d.id === id)?.name) || (id ? id.slice(0, 8) : "—");
const orgName = (l: DiskLookups | null, id?: string | null) =>
  (id && [...(l?.organizations ?? []), ...(l?.vendors ?? [])].find((d) => d.id === id)?.name) || (id ? id.slice(0, 8) : "—");

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function Overview() {
  const [data, setData] = useState<DiskDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    diskApi.dashboard().then(setData).catch((e) => setError(errText(e)));
  }, []);
  if (error) return <Card title="Overview"><p className="fg-disk__error" role="alert">{error}</p></Card>;
  if (!data) return <Spinner block label="Loading disk overview…" />;
  const metrics: [string, number][] = [
    ["Total media", data.totalDisks],
    ["Available", data.available],
    ["Reserved", data.reserved],
    ["Dispatched", data.dispatched],
    ["In transit", data.inTransit],
    ["Delivered", data.delivered],
    ["At vendor", data.atVendor],
    ["Returned", data.returned],
    ["Damaged", data.damaged],
    ["Lost", data.lost],
    ["Open shipment exceptions", data.openShipmentExceptions],
  ];
  return (
    <Card title="Disk logistics overview" subtitle="Chain-of-custody view of all physical media in your scope.">
      <div className="fg-disk__metrics">
        {metrics.map(([label, value]) => (
          <div key={label} className="fg-disk__metric">
            <span className="fg-disk__metric-value">{value}</span>
            <span className="fg-disk__metric-label">{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Disks list + register
// ---------------------------------------------------------------------------
function DisksList({ lookups }: { lookups: DiskLookups | null }) {
  const [rows, setRows] = useState<Disk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    diskApi
      .listDisks({ status: status || undefined, mediaType: mediaType || undefined, search: search || undefined }, page, 25)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [status, mediaType, search, page]);
  useEffect(load, [load]);

  return (
    <Card title="Disks & media" subtitle="Every registered disk with its current status and custody.">
      <div className="fg-disk__filters">
        <Select
          label="Status"
          value={status}
          options={[{ label: "All statuses", value: "" }, ...(lookups?.statuses ?? []).map((s) => ({ label: human(s), value: s }))]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Media type"
          value={mediaType}
          options={[{ label: "All media", value: "" }, ...(lookups?.mediaTypes ?? []).map((m) => ({ label: m, value: m }))]}
          onChange={(e) => {
            setMediaType(e.target.value);
            setPage(1);
          }}
        />
        <FormInput
          label="Search serial / code"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {lookups?.canManage ? (
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Register disk"}
          </Button>
        ) : null}
      </div>
      {showForm && lookups?.canManage ? <RegisterForm lookups={lookups} onDone={() => { setShowForm(false); load(); }} /> : null}
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "diskCode", header: "Code", render: (r: Disk) => <Link to={`/disk-logistics/disks/${r.id}`}>{r.diskCode}</Link> },
          { key: "serialNumber", header: "Serial", render: (r: Disk) => r.serialNumber },
          { key: "mediaType", header: "Media", render: (r: Disk) => r.mediaType },
          { key: "status", header: "Status", render: (r: Disk) => <Badge value={r.status} /> },
          { key: "depot", header: "Current depot", render: (r: Disk) => depotName(lookups, r.inventory?.currentDepotId) },
          { key: "custodian", header: "Custodian", render: (r: Disk) => (r.inventory?.currentCustodianType ? human(r.inventory.currentCustodianType) : "—") },
        ]}
        rows={rows}
        rowKey={(r: Disk) => r.id}
        loading={loading}
        emptyTitle="No disks"
        emptyDescription="No media matches the selected filters."
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

function RegisterForm({ lookups, onDone }: { lookups: DiskLookups; onDone: () => void }) {
  const [form, setForm] = useState({ serialNumber: "", mediaType: "HDD", capacity: "", make: "", model: "", receivingDepotId: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await diskApi.register({ ...form, capacity: form.capacity || undefined, make: form.make || undefined, model: form.model || undefined, receivingDepotId: form.receivingDepotId || undefined, remarks: form.remarks || undefined });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="fg-disk__form">
        <FormInput label="Serial number" required value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
        <Select label="Media type" value={form.mediaType} options={lookups.mediaTypes.map((m) => ({ label: m, value: m }))} onChange={(e) => set("mediaType", e.target.value)} />
        <FormInput label="Capacity" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
        <FormInput label="Make" value={form.make} onChange={(e) => set("make", e.target.value)} />
        <FormInput label="Model" value={form.model} onChange={(e) => set("model", e.target.value)} />
        <Select label="Receiving depot" value={form.receivingDepotId} options={[{ label: "Select depot", value: "" }, ...lookups.depots.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => set("receivingDepotId", e.target.value)} />
        <FormInput label="Remarks" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
      </div>
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <Button variant="primary" loading={busy} disabled={!form.serialNumber} onClick={submit}>Register</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disk detail
// ---------------------------------------------------------------------------
function DiskDetail({ lookups }: { lookups: DiskLookups | null }) {
  const { id = "" } = useParams();
  const [disk, setDisk] = useState<(Disk & { custody?: DiskCustody[]; movements?: DiskMovement[] }) | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    diskApi.getDisk(id).then(setDisk).catch((e) => setError(errText(e)));
  }, [id]);
  useEffect(load, [load]);

  const changeStatus = async () => {
    const status = window.prompt("New status (e.g. UNDER_INSPECTION, AVAILABLE, INACTIVE):");
    if (!status) return;
    const reason = window.prompt("Reason for the status change:") || "";
    if (!reason) return;
    try {
      await diskApi.updateStatus(id, { status: status.toUpperCase(), reason });
      setMsg("Status updated.");
      load();
    } catch (e) {
      setError(errText(e));
    }
  };
  const transfer = async () => {
    const custodianId = window.prompt("New custodian organization/depot id:");
    if (!custodianId) return;
    const reason = window.prompt("Reason for custody transfer:") || "";
    if (!reason) return;
    try {
      await diskApi.transferCustody(id, { custodianType: "DEPOT", custodianId, depotId: custodianId, reason });
      setMsg("Custody transferred.");
      load();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (error) return <Card title="Disk"><p className="fg-disk__error" role="alert">{error}</p><Link to="/disk-logistics/disks">Back to disks</Link></Card>;
  if (!disk) return <Spinner block label="Loading disk…" />;
  return (
    <>
      <Card title={`${disk.diskCode} — ${disk.serialNumber}`} subtitle={<Badge value={disk.status} />}>
        {msg ? <p className="fg-disk__ok">{msg}</p> : null}
        <div className="fg-disk__cols">
          <dl className="fg-disk__kv">
            <dt>Media type</dt><dd>{disk.mediaType}</dd>
            <dt>Capacity</dt><dd>{disk.capacity ?? "—"}</dd>
            <dt>Make / model</dt><dd>{[disk.make, disk.model].filter(Boolean).join(" ") || "—"}</dd>
            <dt>Current depot</dt><dd>{depotName(lookups, disk.inventory?.currentDepotId)}</dd>
            <dt>Custodian</dt><dd>{disk.inventory?.currentCustodianType ? `${human(disk.inventory.currentCustodianType)} · ${orgName(lookups, disk.inventory.currentCustodianId)}` : "—"}</dd>
            <dt>Condition</dt><dd>{disk.condition ?? "—"}</dd>
            <dt>Received</dt><dd>{dt(disk.inventory?.receivedAt)}</dd>
          </dl>
          {lookups?.canManage ? (
            <div className="fg-disk__actions">
              <Button variant="secondary" onClick={changeStatus}>Change status</Button>
              <Button variant="secondary" onClick={transfer}>Transfer custody</Button>
            </div>
          ) : null}
        </div>
      </Card>
      <Card title="Custody chain">
        <DataTable
          columns={[
            { key: "from", header: "From", render: (r: DiskCustody) => dt(r.fromDate) },
            { key: "to", header: "To", render: (r: DiskCustody) => (r.toDate ? dt(r.toDate) : "current") },
            { key: "type", header: "Custodian", render: (r: DiskCustody) => human(r.custodianType) },
            { key: "location", header: "Location / depot", render: (r: DiskCustody) => r.location ?? depotName(lookups, r.depotId) },
          ]}
          rows={disk.custody ?? []}
          rowKey={(r: DiskCustody) => r.id}
          emptyTitle="No custody records"
        />
      </Card>
      <Card title="Movement ledger">
        <DataTable
          columns={[
            { key: "when", header: "When", render: (r: DiskMovement) => dt(r.occurredAt) },
            { key: "type", header: "Type", render: (r: DiskMovement) => human(r.type) },
            { key: "reason", header: "Reason", render: (r: DiskMovement) => r.reason ?? "—" },
            { key: "ref", header: "Reference", render: (r: DiskMovement) => r.reference ?? "—" },
          ]}
          rows={disk.movements ?? []}
          rowKey={(r: DiskMovement) => r.id}
          emptyTitle="No movements"
        />
      </Card>
      <Link to="/disk-logistics/disks">← Back to disks</Link>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shipments list + create
// ---------------------------------------------------------------------------
function ShipmentsList({ lookups }: { lookups: DiskLookups | null }) {
  const [rows, setRows] = useState<DiskShipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    diskApi
      .listShipments({}, page, 25)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [page]);
  useEffect(load, [load]);

  return (
    <Card title="Disk shipments" subtitle="Plan, dispatch, track and receive media movements between sites.">
      {lookups?.canManage ? (
        <div className="fg-disk__actions">
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "New shipment"}</Button>
        </div>
      ) : null}
      {showForm && lookups?.canManage ? <ShipmentForm lookups={lookups} onDone={() => { setShowForm(false); load(); }} /> : null}
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "reference", header: "Reference", render: (r: DiskShipment) => <Link to={`/disk-logistics/shipments/${r.id}`}>{r.reference}</Link> },
          { key: "type", header: "Type", render: (r: DiskShipment) => human(r.type) },
          { key: "status", header: "Status", render: (r: DiskShipment) => <Badge value={r.status} /> },
          { key: "from", header: "From", render: (r: DiskShipment) => depotName(lookups, r.sourceDepotId) },
          { key: "to", header: "To", render: (r: DiskShipment) => orgName(lookups, r.destinationOrgId) || depotName(lookups, r.destinationDepotId) },
          { key: "items", header: "Disks", render: (r: DiskShipment) => r.items?.length ?? "—" },
        ]}
        rows={rows}
        rowKey={(r: DiskShipment) => r.id}
        loading={loading}
        emptyTitle="No shipments"
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

function ShipmentForm({ lookups, onDone }: { lookups: DiskLookups; onDone: () => void }) {
  const [type, setType] = useState("DEPOT_TO_VENDOR");
  const [sourceDepotId, setSourceDepotId] = useState("");
  const [destinationOrgId, setDestinationOrgId] = useState("");
  const [destinationDepotId, setDestinationDepotId] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [available, setAvailable] = useState<Disk[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    diskApi.listDisks({ status: "AVAILABLE" }, 1, 200).then((r) => setAvailable(r.data)).catch(() => setAvailable([]));
  }, []);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await diskApi.createShipment({
        type,
        sourceDepotId: sourceDepotId || undefined,
        destinationOrgId: destinationOrgId || undefined,
        destinationDepotId: destinationDepotId || undefined,
        transporterId: transporterId || undefined,
        diskIds: [...selected],
      });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="fg-disk__form">
        <Select label="Type" value={type} options={lookups.shipmentTypes.map((t) => ({ label: human(t), value: t }))} onChange={(e) => setType(e.target.value)} />
        <Select label="Source depot" value={sourceDepotId} options={[{ label: "—", value: "" }, ...lookups.depots.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => setSourceDepotId(e.target.value)} />
        <Select label="Destination org" value={destinationOrgId} options={[{ label: "—", value: "" }, ...lookups.vendors.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => setDestinationOrgId(e.target.value)} />
        <Select label="Destination depot" value={destinationDepotId} options={[{ label: "—", value: "" }, ...lookups.depots.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => setDestinationDepotId(e.target.value)} />
        <Select label="Transporter" value={transporterId} options={[{ label: "—", value: "" }, ...lookups.transporters.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => setTransporterId(e.target.value)} />
      </div>
      <p className="fg-disk__note">Select available disks to include ({selected.size} selected):</p>
      <div className="fg-disk__pick">
        {available.length === 0 ? <span>No available disks.</span> : available.map((d) => (
          <label key={d.id}>
            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
            {d.diskCode} · {d.serialNumber} ({d.mediaType})
          </label>
        ))}
      </div>
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <div className="fg-disk__actions">
        <Button variant="primary" loading={busy} disabled={selected.size === 0} onClick={submit}>Create shipment</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipment detail
// ---------------------------------------------------------------------------
function ShipmentDetail({ lookups }: { lookups: DiskLookups | null }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [ship, setShip] = useState<DiskShipment | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [recv, setRecv] = useState<Record<string, { received: boolean; damaged: boolean }>>({});
  const load = useCallback(() => {
    diskApi.getShipment(id).then((s) => {
      setShip(s);
      const init: Record<string, { received: boolean; damaged: boolean }> = {};
      (s.items ?? []).forEach((it) => (init[it.diskId] = { received: true, damaged: false }));
      setRecv(init);
    }).catch((e) => setError(errText(e)));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError("");
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (error && !ship) return <Card title="Shipment"><p className="fg-disk__error" role="alert">{error}</p><Link to="/disk-logistics/shipments">Back</Link></Card>;
  if (!ship) return <Spinner block label="Loading shipment…" />;
  const canManage = lookups?.canManage;
  const isOpen = !["DELIVERED", "CANCELLED"].includes(ship.status);
  return (
    <>
      <Card title={`${ship.reference}`} subtitle={<Badge value={ship.status} />}>
        {msg ? <p className="fg-disk__ok">{msg}</p> : null}
        {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
        <dl className="fg-disk__kv">
          <dt>Type</dt><dd>{human(ship.type)}</dd>
          <dt>From depot</dt><dd>{depotName(lookups, ship.sourceDepotId)}</dd>
          <dt>Destination</dt><dd>{orgName(lookups, ship.destinationOrgId) || depotName(lookups, ship.destinationDepotId)}</dd>
          <dt>Transporter</dt><dd>{orgName(lookups, ship.transporterId)}</dd>
          <dt>Dispatched</dt><dd>{dt(ship.dispatchedAt)}</dd>
          <dt>Delivered</dt><dd>{dt(ship.deliveredAt)}</dd>
          {ship.exception ? (<><dt>Exception</dt><dd>{ship.exception}</dd></>) : null}
        </dl>
        {canManage && isOpen ? (
          <div className="fg-disk__actions">
            {["PLANNED", "READY"].includes(ship.status) ? (
              <Button variant="primary" onClick={() => act(() => diskApi.dispatchShipment(id, {}), "Shipment dispatched.")}>Dispatch</Button>
            ) : null}
            {["DISPATCHED", "IN_TRANSIT"].includes(ship.status) ? (
              <Button variant="secondary" onClick={() => {
                const event = window.prompt("Tracking event:");
                if (event) act(() => diskApi.recordTracking(id, { event, inTransit: true }), "Tracking recorded.");
              }}>Add tracking</Button>
            ) : null}
            {["PLANNED", "READY"].includes(ship.status) ? (
              <Button variant="danger" onClick={() => {
                const reason = window.prompt("Cancellation reason:");
                if (reason) act(() => diskApi.cancelShipment(id, reason), "Shipment cancelled.");
              }}>Cancel</Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card title="Shipment items">
        <DataTable
          columns={[
            { key: "code", header: "Disk", render: (r: DiskShipmentItem) => r.disk?.diskCode ?? r.diskId.slice(0, 8) },
            { key: "serial", header: "Serial", render: (r: DiskShipmentItem) => r.disk?.serialNumber ?? "—" },
            { key: "status", header: "Item status", render: (r: DiskShipmentItem) => <Badge value={r.status} /> },
            { key: "recvCond", header: "Received condition", render: (r: DiskShipmentItem) => r.receivedCondition ?? "—" },
          ]}
          rows={ship.items ?? []}
          rowKey={(r: DiskShipmentItem) => r.id}
          emptyTitle="No items"
        />
      </Card>

      {["DISPATCHED", "IN_TRANSIT"].includes(ship.status) ? (
        <Card title="Receive shipment" subtitle="Confirm which disks arrived and their condition. Missing or damaged disks raise discrepancies.">
          <div className="fg-disk__pick">
            {(ship.items ?? []).map((it) => {
              const r = recv[it.diskId] ?? { received: true, damaged: false };
              return (
                <label key={it.diskId}>
                  <input type="checkbox" checked={r.received} onChange={(e) => setRecv((s) => ({ ...s, [it.diskId]: { ...r, received: e.target.checked } }))} />
                  {it.disk?.diskCode ?? it.diskId.slice(0, 8)} received
                  <input type="checkbox" checked={r.damaged} disabled={!r.received} onChange={(e) => setRecv((s) => ({ ...s, [it.diskId]: { ...r, damaged: e.target.checked } }))} />
                  damaged
                </label>
              );
            })}
          </div>
          <div className="fg-disk__actions">
            <Button variant="primary" onClick={() =>
              act(() => diskApi.receiveShipment(id, {
                items: (ship.items ?? []).map((it) => ({ diskId: it.diskId, received: recv[it.diskId]?.received ?? true, damaged: recv[it.diskId]?.damaged ?? false })),
              }), "Shipment received.")
            }>Confirm receipt</Button>
          </div>
        </Card>
      ) : null}
      <Button variant="ghost" onClick={() => navigate("/disk-logistics/shipments")}>← Back to shipments</Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation list + create + detail
// ---------------------------------------------------------------------------
function ReconciliationList({ lookups }: { lookups: DiskLookups | null }) {
  const [rows, setRows] = useState<DiskReconciliation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    diskApi.listReconciliations({}, page, 25).then((r) => { setRows(r.data); setTotal(r.meta.total); setError(""); }).catch((e) => setError(errText(e))).finally(() => setLoading(false));
  }, [page]);
  useEffect(load, [load]);
  return (
    <Card title="Reconciliations" subtitle="Physical stock counts reviewed independently before any adjustment is applied.">
      {lookups?.canManage ? (
        <div className="fg-disk__actions"><Button variant="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Start reconciliation"}</Button></div>
      ) : null}
      {showForm && lookups?.canManage ? <ReconciliationForm lookups={lookups} onDone={() => { setShowForm(false); load(); }} /> : null}
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "reference", header: "Reference", render: (r: DiskReconciliation) => <Link to={`/disk-logistics/reconciliation/${r.id}`}>{r.reference}</Link> },
          { key: "scope", header: "Scope", render: (r: DiskReconciliation) => human(r.scope) },
          { key: "status", header: "Status", render: (r: DiskReconciliation) => <Badge value={r.status} /> },
          { key: "created", header: "Started", render: (r: DiskReconciliation) => dt(r.createdAt) },
        ]}
        rows={rows}
        rowKey={(r: DiskReconciliation) => r.id}
        loading={loading}
        emptyTitle="No reconciliations"
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

function ReconciliationForm({ lookups, onDone }: { lookups: DiskLookups; onDone: () => void }) {
  const [scope, setScope] = useState("DEPOT");
  const [scopeId, setScopeId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scopeOptions = scope === "DEPOT" ? lookups.depots : lookups.vendors;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await diskApi.createReconciliation({ scope, scopeId, notes: notes || undefined });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="fg-disk__form">
        <Select label="Scope" value={scope} options={[{ label: "Depot", value: "DEPOT" }, { label: "Vendor", value: "VENDOR" }, { label: "Organization", value: "ORGANIZATION" }]} onChange={(e) => { setScope(e.target.value); setScopeId(""); }} />
        <Select label="Scope target" value={scopeId} options={[{ label: "Select…", value: "" }, ...scopeOptions.map((d) => ({ label: d.name, value: d.id }))]} onChange={(e) => setScopeId(e.target.value)} />
        <FormInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <Button variant="primary" loading={busy} disabled={!scopeId} onClick={submit}>Start</Button>
    </div>
  );
}

function ReconciliationDetail({ lookups }: { lookups: DiskLookups | null }) {
  const { id = "" } = useParams();
  const [rec, setRec] = useState<DiskReconciliation | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    diskApi.getReconciliation(id).then(setRec).catch((e) => setError(errText(e)));
  }, [id]);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(""); setMsg("");
    try { await fn(); setMsg(ok); load(); } catch (e) { setError(errText(e)); }
  };
  if (error && !rec) return <Card title="Reconciliation"><p className="fg-disk__error" role="alert">{error}</p><Link to="/disk-logistics/reconciliation">Back</Link></Card>;
  if (!rec) return <Spinner block label="Loading reconciliation…" />;
  return (
    <>
      <Card title={rec.reference} subtitle={<Badge value={rec.status} />}>
        {msg ? <p className="fg-disk__ok">{msg}</p> : null}
        {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
        <dl className="fg-disk__kv">
          <dt>Scope</dt><dd>{human(rec.scope)}</dd>
          <dt>Notes</dt><dd>{rec.notes ?? "—"}</dd>
          <dt>Submitted</dt><dd>{dt(rec.submittedAt)}</dd>
          <dt>Reviewed</dt><dd>{dt(rec.reviewedAt)}</dd>
          {rec.reviewComment ? (<><dt>Review comment</dt><dd>{rec.reviewComment}</dd></>) : null}
        </dl>
        <div className="fg-disk__actions">
          {lookups?.canManage && rec.status === "DRAFT" ? (
            <Button variant="primary" onClick={() => act(() => diskApi.submitReconciliation(id), "Submitted for review.")}>Submit for review</Button>
          ) : null}
          {lookups?.canReview && rec.status === "SUBMITTED" ? (
            <>
              <Button variant="primary" onClick={() => {
                const comment = window.prompt("Approval comment:") || "";
                if (comment) act(() => diskApi.reviewReconciliation(id, { decision: "APPROVE", comment }), "Approved. Adjustments applied.");
              }}>Approve</Button>
              <Button variant="danger" onClick={() => {
                const comment = window.prompt("Rejection comment:") || "";
                if (comment) act(() => diskApi.reviewReconciliation(id, { decision: "REJECT", comment }), "Rejected.");
              }}>Reject</Button>
            </>
          ) : null}
        </div>
      </Card>
      <Card title="Reconciliation items">
        <DataTable
          columns={[
            { key: "ref", header: "Disk ref", render: (r) => r.diskRef ?? r.diskId?.slice(0, 8) ?? "—" },
            { key: "result", header: "Result", render: (r) => <Badge value={r.result} /> },
            { key: "disc", header: "Discrepancy", render: (r) => r.discrepancy ?? "—" },
          ]}
          rows={rec.items ?? []}
          rowKey={(r) => r.id}
          emptyTitle="No items recorded"
        />
      </Card>
      <Link to="/disk-logistics/reconciliation">← Back to reconciliations</Link>
    </>
  );
}

// ---------------------------------------------------------------------------
// Discrepancies
// ---------------------------------------------------------------------------
function DiscrepancyList({ lookups }: { lookups: DiskLookups | null }) {
  const [rows, setRows] = useState<DiskDiscrepancy[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    diskApi.listDiscrepancies({}, page, 25).then((r) => { setRows(r.data); setTotal(r.meta.total); setError(""); }).catch((e) => setError(errText(e))).finally(() => setLoading(false));
  }, [page]);
  useEffect(load, [load]);
  const transition = async (d: DiskDiscrepancy) => {
    const status = window.prompt("Transition to (UNDER_REVIEW, CONFIRMED, DISPUTED, RESOLVED, CLOSED):");
    if (!status) return;
    const remarks = window.prompt("Remarks:") || "";
    if (!remarks) return;
    setError(""); setMsg("");
    try {
      await diskApi.transitionDiscrepancy(d.id, { status: status.toUpperCase(), remarks });
      setMsg("Discrepancy updated.");
      load();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Discrepancies" subtitle="Missing, damaged or unaccounted media. Confirming a serious discrepancy marks the disk DAMAGED or LOST.">
      {msg ? <p className="fg-disk__ok">{msg}</p> : null}
      {error ? <p className="fg-disk__error" role="alert">{error}</p> : null}
      <DataTable
        columns={[
          { key: "reference", header: "Reference", render: (r: DiskDiscrepancy) => r.reference },
          { key: "category", header: "Category", render: (r: DiskDiscrepancy) => human(r.category) },
          { key: "severity", header: "Severity", render: (r: DiskDiscrepancy) => <Badge value={r.severity} /> },
          { key: "status", header: "Status", render: (r: DiskDiscrepancy) => <Badge value={r.status} /> },
          { key: "desc", header: "Description", render: (r: DiskDiscrepancy) => r.description },
          {
            key: "actions",
            header: "",
            render: (r: DiskDiscrepancy) =>
              lookups?.canManage || lookups?.canReview ? <Button variant="ghost" onClick={() => transition(r)}>Transition</Button> : null,
          },
        ]}
        rows={rows}
        rowKey={(r: DiskDiscrepancy) => r.id}
        loading={loading}
        emptyTitle="No discrepancies"
        emptyDescription="No disk discrepancies in your scope."
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Module shell
// ---------------------------------------------------------------------------
export function DiskLogisticsPage() {
  useDocumentTitle("Disk logistics");
  const lookups = useLookups();
  const tabs = useMemo(
    () => [
      ["", "Overview"],
      ["disks", "Disks"],
      ["shipments", "Shipments"],
      ["reconciliation", "Reconciliation"],
      ["discrepancies", "Discrepancies"],
    ],
    [],
  );
  return (
    <div className="fg-disk">
      <PageTitle title="Disk & media logistics" description="Track physical media across depots, vendors and transit with full chain of custody." />
      <nav className="fg-disk__tabs" aria-label="Disk logistics sections">
        {tabs.map(([p, label]) => (
          <NavLink key={p} end={p === ""} to={`/disk-logistics${p ? "/" + p : ""}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="disks" element={<DisksList lookups={lookups} />} />
        <Route path="disks/:id" element={<DiskDetail lookups={lookups} />} />
        <Route path="shipments" element={<ShipmentsList lookups={lookups} />} />
        <Route path="shipments/:id" element={<ShipmentDetail lookups={lookups} />} />
        <Route path="reconciliation" element={<ReconciliationList lookups={lookups} />} />
        <Route path="reconciliation/:id" element={<ReconciliationDetail lookups={lookups} />} />
        <Route path="discrepancies" element={<DiscrepancyList lookups={lookups} />} />
        <Route path="*" element={<EmptyState title="Not found" description="This disk logistics view does not exist." />} />
      </Routes>
    </div>
  );
}
