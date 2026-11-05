import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  FormInput,
  Modal,
  Pagination,
  Select,
  StatusBadge,
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { inspectionsApi as api } from "@/services/inspectionsService";
import type {
  Comparison,
  Discrepancy,
  Handover,
  InspectionTemplate,
  InspectionDashboard,
  ProofOfDelivery,
} from "@/types/inspections";
import {
  AuthedImage,
  Boundary,
  DISCREPANCY_CATEGORIES,
  Feedback,
  PHOTO_CATEGORIES,
  SEVERITIES,
  SeverityTag,
  StatusTag,
  errText,
  human,
  useLoad,
  when,
} from "./inspectionsShared";

const STAGES: { key: string; label: string }[] = [
  { key: "INITIAL_RECEIPT", label: "Initial CTS receipt" },
  { key: "PRE_DISPATCH", label: "Pre-dispatch" },
  { key: "RECEIVING", label: "Receiving" },
];

// ---------------------------------------------------------------------------
// Dispatch vs Receiving photo comparison
// ---------------------------------------------------------------------------
export function ComparisonScreen() {
  const [params, setParams] = useSearchParams();
  const vehicleId = params.get("vehicleId") ?? "";
  const dispatchId = params.get("dispatchId") ?? "";
  const [vInput, setVInput] = useState(vehicleId);
  const [zoom, setZoom] = useState<{ path: string; label: string } | null>(null);
  const cmp = useLoad<Comparison>(
    vehicleId
      ? `/inspections/comparison/${vehicleId}${dispatchId ? "?dispatchId=" + dispatchId : ""}`
      : null,
  );
  const categories = PHOTO_CATEGORIES.filter((c) =>
    STAGES.some((s) =>
      (cmp.data?.stages[s.key as keyof Comparison["stages"]] ?? []).some(
        (p) => p.category === c,
      ),
    ),
  );
  return (
    <>
      <Card
        title="Dispatch vs receiving comparison"
        subtitle="Side-by-side condition photographs. Image differences are NOT damage until an authorized inspector classifies a discrepancy."
      >
        <form
          className="fg-insp__filters"
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams(params);
            if (vInput) next.set("vehicleId", vInput);
            else next.delete("vehicleId");
            setParams(next);
          }}
        >
          <FormInput
            label="Vehicle ID"
            value={vInput}
            onChange={(e) => setVInput(e.target.value)}
            placeholder="Vehicle UUID"
          />
          <Button type="submit">Compare</Button>
        </form>
        {cmp.data ? (
          <p className="fg-insp__note">{cmp.data.note}</p>
        ) : (
          <p className="fg-insp__muted">
            Enter a vehicle ID (or open comparison from an inspection) to view
            recorded photographs across stages.
          </p>
        )}
      </Card>
      {vehicleId ? (
        <Boundary {...cmp}>
          {cmp.data ? (
            <Card title={`Vehicle ${cmp.data.vehicle?.registrationNumber ?? vehicleId}`}>
              {categories.length === 0 ? (
                <p className="fg-insp__muted">
                  No photographs recorded for this vehicle yet. A route or image
                  is never invented when evidence is unavailable.
                </p>
              ) : (
                <div className="fg-insp__compare">
                  <div className="fg-insp__compare-head">
                    <span>Category</span>
                    {STAGES.map((s) => (
                      <span key={s.key}>{s.label}</span>
                    ))}
                  </div>
                  {categories.map((cat) => (
                    <div className="fg-insp__compare-row" key={cat}>
                      <span className="fg-insp__compare-cat">{human(cat)}</span>
                      {STAGES.map((s) => {
                        const photo = (
                          cmp.data!.stages[s.key as keyof Comparison["stages"]] ??
                          []
                        ).find((p) => p.category === cat);
                        return (
                          <div key={s.key} className="fg-insp__compare-cell">
                            {photo ? (
                              <figure>
                                <AuthedImage
                                  path={photo.downloadPath}
                                  alt={`${human(cat)} ${s.label}`}
                                  onClick={() =>
                                    setZoom({
                                      path: photo.downloadPath,
                                      label: `${human(cat)} · ${s.label}`,
                                    })
                                  }
                                />
                                <figcaption>
                                  {when(photo.takenAt)}
                                  <br />
                                  {photo.uploadedBy ?? "Unknown"}
                                  {photo.reused ? " · reused dispatch evidence" : ""}
                                  <br />
                                  <span className="fg-insp__muted">
                                    {photo.inspectionReference}
                                  </span>
                                </figcaption>
                              </figure>
                            ) : (
                              <span className="fg-insp__muted">No photo</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
        </Boundary>
      ) : null}
      {zoom ? (
        <Modal open title={zoom.label} onClose={() => setZoom(null)}>
          <AuthedImage path={zoom.path} alt={zoom.label} />
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Discrepancies
// ---------------------------------------------------------------------------
export function DiscrepancyList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Discrepancy[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .list<Discrepancy>("/discrepancies", { page, pageSize: 25, status: status || undefined })
      .then((r) => {
        if (!active) return;
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => active && setError(errText(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, status]);
  return (
    <Card title="Damage & discrepancy management">
      <div className="fg-insp__filters">
        <Select
          label="Status"
          value={status}
          options={[
            { label: "All statuses", value: "" },
            ...["REPORTED", "UNDER_REVIEW", "CONFIRMED", "DISPUTED", "RESOLVED", "CLOSED"].map(
              (s) => ({ label: human(s), value: s }),
            ),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <Feedback error={error} />
      <DataTable
        columns={[
          {
            key: "reference",
            header: "Reference",
            render: (d: Discrepancy) => (
              <Link to={`/inspections/discrepancies/${d.id}`}>{d.reference}</Link>
            ),
          },
          {
            key: "vehicle",
            header: "Vehicle",
            render: (d: Discrepancy) => d.vehicle?.registrationNumber ?? d.vehicleId.slice(0, 8),
          },
          { key: "category", header: "Category", render: (d: Discrepancy) => human(d.category) },
          {
            key: "severity",
            header: "Severity",
            render: (d: Discrepancy) => <SeverityTag severity={d.severity} />,
          },
          {
            key: "status",
            header: "Status",
            render: (d: Discrepancy) => <StatusTag status={d.status} />,
          },
          { key: "created", header: "Reported", render: (d: Discrepancy) => when(d.createdAt) },
        ]}
        rows={rows}
        rowKey={(d: Discrepancy) => d.id}
        loading={loading}
        emptyTitle="No discrepancies"
        emptyDescription="Discrepancies are raised from receiving inspections or the comparison screen."
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

const DISCREPANCY_NEXT: Record<string, string[]> = {
  REPORTED: ["UNDER_REVIEW", "CONFIRMED", "DISPUTED"],
  UNDER_REVIEW: ["CONFIRMED", "DISPUTED", "RESOLVED"],
  CONFIRMED: ["RESOLVED", "DISPUTED"],
  DISPUTED: ["UNDER_REVIEW", "CONFIRMED", "RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function DiscrepancyDetail() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const d = useLoad<Discrepancy>(`/discrepancies/${id}`);
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canTransition =
    hasPermission("inspections:confirm") ||
    hasPermission("inspections:manage") ||
    hasPermission("inspections:review");
  const transition = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/discrepancies/${id}/transition`, { status, remarks });
      setRemarks("");
      setStatus("");
      d.load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/discrepancies/${id}/comments`, { body: comment });
      setComment("");
      d.load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...d}>
      {d.data ? (
        <>
          <Card
            title={`${d.data.reference} · ${human(d.data.category)}`}
            subtitle={d.data.vehicle?.registrationNumber ?? d.data.vehicleId}
          >
            <div className="fg-insp__tags">
              <SeverityTag severity={d.data.severity} />
              <StatusTag status={d.data.status} />
              {d.data.aiSuggested ? (
                <StatusBadge tone="warning">
                  AI suggestion — {d.data.aiConfirmed ? "human-confirmed" : "needs human confirmation"}
                </StatusBadge>
              ) : null}
            </div>
            <p>{d.data.description}</p>
            <dl className="fg-insp__facts">
              <div>
                <dt>Linked inspection</dt>
                <dd>
                  {d.data.inspectionId ? (
                    <Link to={`/inspections/${d.data.inspectionId}`}>View inspection</Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Reported</dt>
                <dd>{when(d.data.createdAt)}</dd>
              </div>
              <div>
                <dt>Resolved</dt>
                <dd>{when(d.data.resolvedAt)}</dd>
              </div>
              <div>
                <dt>Resolution remarks</dt>
                <dd>{d.data.resolutionRemarks ?? "—"}</dd>
              </div>
            </dl>
            <p className="fg-insp__note">
              A confirmed MAJOR/CRITICAL discrepancy marks the vehicle unavailable
              through the Inventory service. Custody and delivery are never changed
              by a discrepancy alone.
            </p>
          </Card>

          <Card title="Resolution activity">
            {(d.data.comments ?? []).map((c) => (
              <p key={c.id} className="fg-insp__comment">
                <strong>{when(c.createdAt)}</strong>
                {c.fromStatus || c.toStatus
                  ? ` · ${human(c.fromStatus) } → ${human(c.toStatus)}`
                  : ""}
                <br />
                {c.body}
              </p>
            ))}
            {!(d.data.comments ?? []).length ? (
              <p className="fg-insp__muted">No activity yet.</p>
            ) : null}
            <Feedback error={error} />
            {canTransition && DISCREPANCY_NEXT[d.data.status]?.length ? (
              <form className="fg-insp__inline" onSubmit={transition}>
                <Select
                  label="Advance status"
                  required
                  value={status}
                  options={[
                    { label: "Select…", value: "" },
                    ...DISCREPANCY_NEXT[d.data.status].map((s) => ({
                      label: human(s),
                      value: s,
                    })),
                  ]}
                  onChange={(e) => setStatus(e.target.value)}
                />
                <FormInput
                  label="Remarks"
                  required
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
                <Button type="submit" loading={busy} disabled={!status}>
                  Apply
                </Button>
              </form>
            ) : null}
            {canTransition ? (
              <form className="fg-insp__inline" onSubmit={addComment}>
                <FormInput
                  label="Add comment"
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button type="submit" variant="secondary" loading={busy} disabled={!comment}>
                  Comment
                </Button>
              </form>
            ) : null}
          </Card>
        </>
      ) : null}
    </Boundary>
  );
}

// ---------------------------------------------------------------------------
// Digital handover + Proof of Delivery
// ---------------------------------------------------------------------------
export function HandoverList() {
  const { hasPermission } = useAuth();
  const canCreate =
    hasPermission("inspections:confirm") || hasPermission("inspections:manage");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Handover[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState({
    type: "DISPATCH",
    vehicleId: "",
    dispatchId: "",
    handoverByName: "",
    receivedByName: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .list<Handover>("/handover", { page, pageSize: 25 })
      .then((r) => {
        if (!active) return;
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => active && setError(errText(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, tick]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { type: draft.type, vehicleId: draft.vehicleId };
      if (draft.dispatchId) body.dispatchId = draft.dispatchId;
      if (draft.handoverByName) body.handoverByName = draft.handoverByName;
      if (draft.receivedByName) body.receivedByName = draft.receivedByName;
      await api.mutate("/handover", body);
      setDraft({ type: "DISPATCH", vehicleId: "", dispatchId: "", handoverByName: "", receivedByName: "" });
      setTick((n) => n + 1);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Digital handovers">
      <Feedback error={error} />
      {canCreate ? (
        <form className="fg-insp__filters" onSubmit={create}>
          <Select
            label="Type"
            value={draft.type}
            options={[
              { label: "Dispatch", value: "DISPATCH" },
              { label: "Receiving", value: "RECEIVING" },
            ]}
            onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
          />
          <FormInput
            label="Vehicle ID"
            required
            value={draft.vehicleId}
            onChange={(e) => setDraft((d) => ({ ...d, vehicleId: e.target.value }))}
          />
          <FormInput
            label="Dispatch ID (optional)"
            value={draft.dispatchId}
            onChange={(e) => setDraft((d) => ({ ...d, dispatchId: e.target.value }))}
          />
          <FormInput
            label="Handed over by"
            value={draft.handoverByName}
            onChange={(e) => setDraft((d) => ({ ...d, handoverByName: e.target.value }))}
          />
          <FormInput
            label="Received by"
            value={draft.receivedByName}
            onChange={(e) => setDraft((d) => ({ ...d, receivedByName: e.target.value }))}
          />
          <Button type="submit" loading={busy} disabled={!draft.vehicleId}>
            Record handover
          </Button>
        </form>
      ) : null}
      <DataTable
        columns={[
          {
            key: "reference",
            header: "Reference",
            render: (h: Handover) => (
              <Link to={`/inspections/handover/${h.id}`}>{h.reference}</Link>
            ),
          },
          { key: "type", header: "Type", render: (h: Handover) => human(h.type) },
          {
            key: "vehicle",
            header: "Vehicle",
            render: (h: Handover) => h.vehicle?.registrationNumber ?? h.vehicleId.slice(0, 8),
          },
          {
            key: "status",
            header: "Status",
            render: (h: Handover) => <StatusTag status={h.status} />,
          },
          { key: "created", header: "Created", render: (h: Handover) => when(h.createdAt) },
        ]}
        rows={rows}
        rowKey={(h: Handover) => h.id}
        loading={loading}
        emptyTitle="No handovers"
        emptyDescription="Create a handover from an inspection or record one here."
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

export function HandoverDetail() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const h = useLoad<Handover>(`/handover/${id}`);
  const [party, setParty] = useState("RECEIVER");
  const [name, setName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = hasPermission("inspections:confirm") || hasPermission("inspections:manage");
  const acknowledge = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/handover/${id}/acknowledge`, {
        party,
        name,
        acknowledged: true,
        remarks: remarks || undefined,
      });
      setName("");
      setRemarks("");
      h.load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/handover/${id}/confirm`, {});
      h.load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...h}>
      {h.data ? (
        <>
          <Card title={`${h.data.reference} · ${human(h.data.type)} handover`}>
            <StatusTag status={h.data.status} />
            <dl className="fg-insp__facts">
              <div>
                <dt>Handed over by</dt>
                <dd>{h.data.handoverByName ?? h.data.handoverParty ?? "—"}</dd>
              </div>
              <div>
                <dt>Received by</dt>
                <dd>{h.data.receivedByName ?? h.data.receivedParty ?? "—"}</dd>
              </div>
              <div>
                <dt>Confirmed</dt>
                <dd>{when(h.data.confirmedAt)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Acknowledgements">
            {(h.data.acknowledgements ?? []).map((a) => (
              <p key={a.id}>
                <strong>{human(a.party)}</strong> · {a.name} ·{" "}
                {a.acknowledged ? "acknowledged" : "declined"} · {when(a.acknowledgedAt)}
                {a.remarks ? ` · ${a.remarks}` : ""}
              </p>
            ))}
            {!(h.data.acknowledgements ?? []).length ? (
              <p className="fg-insp__muted">No acknowledgements captured.</p>
            ) : null}
            <Feedback error={error} />
            {canConfirm && h.data.status === "PENDING" ? (
              <>
                <form className="fg-insp__inline" onSubmit={acknowledge}>
                  <Select
                    label="Party"
                    value={party}
                    options={[
                      { label: "Receiver", value: "RECEIVER" },
                      { label: "Handover", value: "HANDOVER" },
                    ]}
                    onChange={(e) => setParty(e.target.value)}
                  />
                  <FormInput
                    label="Name / signatory"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <FormInput
                    label="Remarks (optional)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" loading={busy} disabled={!name}>
                    Record acknowledgement
                  </Button>
                </form>
                <Button onClick={confirm} loading={busy}>
                  Confirm handover
                </Button>
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </Boundary>
  );
}

export function PodScreen() {
  const { hasPermission } = useAuth();
  const canGenerate = hasPermission("inspections:manage");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProofOfDelivery[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<ProofOfDelivery | null>(null);
  const [gen, setGen] = useState({ dispatchId: "", vehicleId: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .list<ProofOfDelivery>("/handover/pod", { page, pageSize: 25 })
      .then((r) => {
        if (!active) return;
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      })
      .catch((e) => active && setError(errText(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, tick]);
  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const pod = await api.mutate<ProofOfDelivery>("/handover/pod", gen);
      setGen({ dispatchId: "", vehicleId: "" });
      setTick((n) => n + 1);
      setSelected(pod);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const s = (selected?.summary ?? {}) as Record<string, any>;
  return (
    <>
      <Card title="Proof of delivery">
        <Feedback error={error} />
        {canGenerate ? (
          <form className="fg-insp__filters" onSubmit={generate}>
            <FormInput
              label="Dispatch ID"
              required
              value={gen.dispatchId}
              onChange={(e) => setGen((g) => ({ ...g, dispatchId: e.target.value }))}
            />
            <FormInput
              label="Vehicle ID"
              required
              value={gen.vehicleId}
              onChange={(e) => setGen((g) => ({ ...g, vehicleId: e.target.value }))}
            />
            <Button type="submit" loading={busy} disabled={!gen.dispatchId || !gen.vehicleId}>
              Generate POD
            </Button>
          </form>
        ) : null}
        <DataTable
          columns={[
            {
              key: "reference",
              header: "Reference",
              render: (p: ProofOfDelivery) => (
                <button className="fg-insp__linkbtn" onClick={() => setSelected(p)}>
                  {p.reference}
                </button>
              ),
            },
            {
              key: "vehicle",
              header: "Vehicle",
              render: (p: ProofOfDelivery) =>
                ((p.summary as any)?.vehicle?.registrationNumber ?? p.vehicleId.slice(0, 8)),
            },
            {
              key: "dispatch",
              header: "Dispatch",
              render: (p: ProofOfDelivery) => (p.summary as any)?.dispatchReference ?? "—",
            },
            { key: "generated", header: "Generated", render: (p: ProofOfDelivery) => when(p.generatedAt) },
            {
              key: "doc",
              header: "Document",
              render: (p: ProofOfDelivery) => (
                <Button
                  variant="ghost"
                  onClick={() => api.openDocument(`/handover/pod/${p.id}/document`)}
                >
                  Open / print PDF
                </Button>
              ),
            },
          ]}
          rows={rows}
          rowKey={(p: ProofOfDelivery) => p.id}
          loading={loading}
          emptyTitle="No proofs of delivery"
          emptyDescription="Generate a POD from a dispatch once receiving and handover are recorded."
        />
        <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
      </Card>
      {selected ? (
        <Card title={`${selected.reference} summary`}>
          <dl className="fg-insp__facts">
            <div>
              <dt>Ticket</dt>
              <dd>{s.ticketReference ?? "—"}</dd>
            </div>
            <div>
              <dt>Dispatch</dt>
              <dd>{s.dispatchReference ?? "—"}</dd>
            </div>
            <div>
              <dt>Trip</dt>
              <dd>{s.tripReference ?? "—"}</dd>
            </div>
            <div>
              <dt>Source → destination</dt>
              <dd>
                {(s.source?.name ?? "—") + " → " + (s.destination?.name ?? "—")}
              </dd>
            </div>
            <div>
              <dt>Unresolved discrepancies</dt>
              <dd>{s.unresolvedDiscrepancies ?? 0}</dd>
            </div>
          </dl>
          <Button onClick={() => api.openDocument(`/handover/pod/${selected.id}/document`)}>
            Open printable POD
          </Button>
        </Card>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export function Templates() {
  const t = useLoad<InspectionTemplate[]>("/inspections/templates");
  return (
    <Boundary {...t}>
      <Card
        title="Inspection templates"
        subtitle="Configure mandatory checklist items and photographs per inspection type."
      >
        <Feedback error={t.error} />
        {(t.data ?? []).map((tpl) => (
          <div key={tpl.id} className="fg-insp__template">
            <h4>
              {tpl.name} <span className="fg-insp__muted">· {human(tpl.type)}</span>
              {tpl.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
              {!tpl.isActive ? <StatusBadge tone="neutral">Inactive</StatusBadge> : null}
            </h4>
            <ul>
              {tpl.items.map((it) => (
                <li key={it.id}>
                  {it.label}
                  {it.required ? " · required" : " · optional"}
                  {it.photoRequired
                    ? ` · photo (${human(it.requiredPhotoCategory)})`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!(t.data ?? []).length ? (
          <p className="fg-insp__muted">
            No templates yet. Run the inspections enable script to seed defaults.
          </p>
        ) : null}
      </Card>
    </Boundary>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export function Reports() {
  const d = useLoad<InspectionDashboard>("/inspections/reports");
  return (
    <Boundary {...d}>
      <Card title="Inspection reports">
        {d.data ? (
          <>
            <h4>Inspections by type</h4>
            <ul>
              {Object.entries(d.data.byType).map(([k, v]) => (
                <li key={k}>
                  {human(k)}: <strong>{v}</strong>
                </li>
              ))}
              {!Object.keys(d.data.byType).length ? <li>No inspections recorded.</li> : null}
            </ul>
            <h4>Inspections by status</h4>
            <ul>
              {Object.entries(d.data.byStatus).map(([k, v]) => (
                <li key={k}>
                  {human(k)}: <strong>{v}</strong>
                </li>
              ))}
            </ul>
            <p className="fg-insp__note">
              Figures are drawn only from recorded inspections, discrepancies and
              handovers in your authorized scope. No condition data is inferred.
            </p>
          </>
        ) : null}
      </Card>
    </Boundary>
  );
}

export { DISCREPANCY_CATEGORIES, SEVERITIES };
