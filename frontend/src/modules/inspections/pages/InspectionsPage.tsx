import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  FormInput,
  PageTitle,
  Pagination,
  Select,
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { inspectionsApi as api } from "@/services/inspectionsService";
import type {
  Inspection,
  InspectionDashboard,
  InspectionLookups,
} from "@/types/inspections";
import {
  AuthedImage,
  Boundary,
  DISCREPANCY_CATEGORIES,
  Feedback,
  INSPECTION_TYPES,
  PHOTO_CATEGORIES,
  RECEIVING_OUTCOMES,
  SEVERITIES,
  StatusTag,
  errText,
  human,
  useLoad,
  when,
} from "./inspectionsShared";
import {
  ComparisonScreen,
  DiscrepancyDetail,
  DiscrepancyList,
  HandoverDetail,
  HandoverList,
  PodScreen,
  Reports,
  Templates,
} from "./InspectionsManagement";
import "./Inspections.css";

export function InspectionsPage() {
  useDocumentTitle("Inspections & Handover");
  const { hasPermission } = useAuth();
  const manage = hasPermission("inspections:manage");
  return (
    <div className="fg-insp">
      <PageTitle
        title="Inspections & digital handover"
        description="Capture vehicle condition from CTS receipt through dispatch and receiving, compare evidence, manage discrepancies and issue proof of delivery."
      />
      <p className="fg-insp__banner">
        Development data is synthetic and clearly referenced. GPS proximity and
        image differences never confirm delivery, custody or damage — authorized
        workflow actions do.
      </p>
      <nav className="fg-insp__tabs" aria-label="Inspection sections">
        {[
          ["", "Overview"],
          ["list", "Inspections"],
          ["comparison", "Comparison"],
          ["discrepancies", "Discrepancies"],
          ["handover", "Handover"],
          ["pod", "Proof of delivery"],
          ...(manage ? [["templates", "Templates"]] : []),
          ["reports", "Reports"],
        ].map(([p, label]) => (
          <NavLink key={p} end={p === ""} to={`/inspections${p ? "/" + p : ""}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="list" element={<InspectionList />} />
        <Route path="new" element={<InspectionForm />} />
        <Route path="comparison" element={<ComparisonScreen />} />
        <Route path="discrepancies" element={<DiscrepancyList />} />
        <Route path="discrepancies/:id" element={<DiscrepancyDetail />} />
        <Route path="handover" element={<HandoverList />} />
        <Route path="handover/:id" element={<HandoverDetail />} />
        <Route path="pod" element={<PodScreen />} />
        <Route path="templates" element={<Templates />} />
        <Route path="reports" element={<Reports />} />
        <Route path=":id" element={<InspectionDetail />} />
      </Routes>
    </div>
  );
}

function Dashboard() {
  const d = useLoad<InspectionDashboard>("/inspections/dashboard");
  const [rows, setRows] = useState<Inspection[]>([]);
  useEffect(() => {
    api
      .list<Inspection>("/inspections", { page: 1, pageSize: 8 })
      .then((r) => setRows(r.data))
      .catch(() => setRows([]));
  }, []);
  const cards = useMemo(() => {
    if (!d.data) return [] as [string, number][];
    return [
      ["Initial receipts", d.data.byType.INITIAL_RECEIPT ?? 0],
      ["Pre-dispatch", d.data.byType.PRE_DISPATCH ?? 0],
      ["Receiving", d.data.byType.RECEIVING ?? 0],
      ["Awaiting review", d.data.byStatus.SUBMITTED ?? 0],
      ["Open discrepancies", d.data.openDiscrepancies],
      ["Pending handovers", d.data.pendingHandovers],
      ["Proofs of delivery", d.data.proofsOfDelivery],
    ] as [string, number][];
  }, [d.data]);
  return (
    <Boundary {...d}>
      <div className="fg-insp__metrics">
        {cards.map(([label, count]) => (
          <Card key={label} title={label}>
            <strong className="fg-insp__metric">{count}</strong>
          </Card>
        ))}
      </div>
      <Card
        title="Recent inspections"
        actions={<Link to="/inspections/new">New inspection</Link>}
      >
        <DataTable
          columns={[
            {
              key: "reference",
              header: "Reference",
              render: (i: Inspection) => <Link to={`/inspections/${i.id}`}>{i.reference}</Link>,
            },
            { key: "type", header: "Type", render: (i: Inspection) => human(i.type) },
            {
              key: "vehicle",
              header: "Vehicle",
              render: (i: Inspection) =>
                i.vehicle?.registrationNumber ?? i.registrationNumber ?? "—",
            },
            {
              key: "status",
              header: "Status",
              render: (i: Inspection) => <StatusTag status={i.status} />,
            },
            { key: "created", header: "Created", render: (i: Inspection) => when(i.createdAt) },
          ]}
          rows={rows}
          rowKey={(i: Inspection) => i.id}
          emptyTitle="No inspections yet"
          emptyDescription="Start with an initial CTS receipt or a pre-dispatch inspection."
        />
      </Card>
    </Boundary>
  );
}

function InspectionList() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Inspection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .list<Inspection>("/inspections", {
        page,
        pageSize: 25,
        type: type || undefined,
        status: status || undefined,
        search: search || undefined,
      })
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
  }, [page, type, status, search]);
  return (
    <Card title="Inspections" actions={<Link to="/inspections/new">New inspection</Link>}>
      <div className="fg-insp__filters">
        <Select
          label="Type"
          value={type}
          options={[{ label: "All types", value: "" }, ...INSPECTION_TYPES]}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Status"
          value={status}
          options={[
            { label: "All statuses", value: "" },
            ...["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "COMPLETED"].map(
              (s) => ({ label: human(s), value: s }),
            ),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <FormInput
          label="Search reference / registration"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
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
            render: (i: Inspection) => <Link to={`/inspections/${i.id}`}>{i.reference}</Link>,
          },
          { key: "type", header: "Type", render: (i: Inspection) => human(i.type) },
          {
            key: "vehicle",
            header: "Vehicle",
            render: (i: Inspection) =>
              i.vehicle?.registrationNumber ?? i.registrationNumber ?? "—",
          },
          {
            key: "status",
            header: "Status",
            render: (i: Inspection) => <StatusTag status={i.status} />,
          },
          { key: "created", header: "Created", render: (i: Inspection) => when(i.createdAt) },
        ]}
        rows={rows}
        rowKey={(i: Inspection) => i.id}
        loading={loading}
        emptyTitle="No inspections"
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

function InspectionForm() {
  const navigate = useNavigate();
  const lookups = useLoad<InspectionLookups>("/inspections/lookups");
  const [form, setForm] = useState({
    type: "INITIAL_RECEIPT",
    vehicleId: "",
    dispatchId: "",
    templateId: "",
    depotId: "",
    organizationId: "",
    receivedFromOrgId: "",
    odometer: "",
    fuelLevel: "",
    exteriorCondition: "",
    interiorCondition: "",
    existingDamage: "",
    receivingOutcome: "",
    generalRemarks: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const templates = (lookups.data?.templates ?? []).filter((t) => t.type === form.type);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { type: form.type, vehicleId: form.vehicleId };
      for (const k of [
        "dispatchId",
        "templateId",
        "depotId",
        "organizationId",
        "receivedFromOrgId",
        "exteriorCondition",
        "interiorCondition",
        "existingDamage",
        "generalRemarks",
      ] as const)
        if (form[k]) body[k] = form[k];
      if (form.odometer) body.odometer = Number(form.odometer);
      if (form.fuelLevel) body.fuelLevel = Number(form.fuelLevel);
      if (form.type === "RECEIVING" && form.receivingOutcome)
        body.receivingOutcome = form.receivingOutcome;
      const created = await api.mutate<Inspection>("/inspections", body);
      navigate(`/inspections/${created.id}`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="New inspection"
      subtitle="Initial CTS receipt, pre-dispatch, receiving or return. Receiving inspections must be linked to a dispatch."
    >
      <Feedback error={error} />
      <form onSubmit={submit}>
        <div className="fg-insp__form">
          <Select
            label="Inspection type"
            required
            value={form.type}
            options={INSPECTION_TYPES}
            onChange={(e) => set("type", e.target.value)}
          />
          <FormInput
            label="Vehicle ID"
            required
            value={form.vehicleId}
            onChange={(e) => set("vehicleId", e.target.value)}
            placeholder="Existing vehicle UUID"
          />
          {(form.type === "PRE_DISPATCH" || form.type === "RECEIVING") && (
            <FormInput
              label={`Dispatch ID${form.type === "RECEIVING" ? " (required)" : ""}`}
              required={form.type === "RECEIVING"}
              value={form.dispatchId}
              onChange={(e) => set("dispatchId", e.target.value)}
              placeholder="Dispatch UUID"
            />
          )}
          <Select
            label="Template (optional)"
            value={form.templateId}
            options={[
              { label: "No template", value: "" },
              ...templates.map((t) => ({
                label: t.name + (t.isDefault ? " (default)" : ""),
                value: t.id,
              })),
            ]}
            onChange={(e) => set("templateId", e.target.value)}
          />
          <Select
            label="Depot"
            value={form.depotId}
            options={[
              { label: "—", value: "" },
              ...(lookups.data?.depots ?? []).map((d) => ({ label: d.name ?? "", value: d.id })),
            ]}
            onChange={(e) => set("depotId", e.target.value)}
          />
          {form.type === "INITIAL_RECEIPT" && (
            <Select
              label="Received from"
              value={form.receivedFromOrgId}
              options={[
                { label: "—", value: "" },
                ...(lookups.data?.organizations ?? []).map((o) => ({
                  label: o.name ?? "",
                  value: o.id,
                })),
              ]}
              onChange={(e) => set("receivedFromOrgId", e.target.value)}
            />
          )}
          {form.type === "RECEIVING" && (
            <>
              <Select
                label="Receiving organization / vendor"
                value={form.organizationId}
                options={[
                  { label: "—", value: "" },
                  ...(lookups.data?.organizations ?? []).map((o) => ({
                    label: o.name ?? "",
                    value: o.id,
                  })),
                ]}
                onChange={(e) => set("organizationId", e.target.value)}
              />
              <Select
                label="Receiving outcome"
                value={form.receivingOutcome}
                options={[
                  { label: "—", value: "" },
                  ...RECEIVING_OUTCOMES.map((o) => ({ label: human(o), value: o })),
                ]}
                onChange={(e) => set("receivingOutcome", e.target.value)}
              />
            </>
          )}
          <FormInput
            label="Odometer"
            type="number"
            value={form.odometer}
            onChange={(e) => set("odometer", e.target.value)}
          />
          <FormInput
            label="Fuel level (%)"
            type="number"
            min={0}
            max={100}
            value={form.fuelLevel}
            onChange={(e) => set("fuelLevel", e.target.value)}
          />
          <FormInput
            label="Exterior condition"
            value={form.exteriorCondition}
            onChange={(e) => set("exteriorCondition", e.target.value)}
          />
          <FormInput
            label="Interior condition"
            value={form.interiorCondition}
            onChange={(e) => set("interiorCondition", e.target.value)}
          />
          <FormInput
            label="Existing damage"
            value={form.existingDamage}
            onChange={(e) => set("existingDamage", e.target.value)}
          />
          <FormInput
            label="General remarks"
            value={form.generalRemarks}
            onChange={(e) => set("generalRemarks", e.target.value)}
          />
        </div>
        <Button type="submit" loading={busy} disabled={!form.vehicleId}>
          Create inspection
        </Button>
      </form>
    </Card>
  );
}

function InspectionDetail() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const insp = useLoad<Inspection>(`/inspections/${id}`);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [photoCategory, setPhotoCategory] = useState("FRONT");
  const [disc, setDisc] = useState({ category: "NEW_SCRATCH", severity: "MINOR", description: "" });
  const canManage = hasPermission("inspections:manage");
  const canReview = hasPermission("inspections:review");
  const canConfirm = hasPermission("inspections:confirm");

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      insp.load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const uploadPhoto = (file: File) =>
    act(() => api.upload(`/inspections/${id}/photos`, file, { category: photoCategory }));
  const createDiscrepancy = (e: FormEvent) => {
    e.preventDefault();
    const d = insp.data!;
    return act(async () => {
      await api.mutate("/discrepancies", {
        vehicleId: d.vehicleId,
        dispatchId: d.dispatchId ?? undefined,
        inspectionId: d.id,
        category: disc.category,
        severity: disc.severity,
        description: disc.description,
      });
      setDisc({ category: "NEW_SCRATCH", severity: "MINOR", description: "" });
    });
  };
  const draft = insp.data?.status === "IN_PROGRESS" || insp.data?.status === "PENDING";
  const editable =
    draft && (insp.data?.type === "RECEIVING" ? canConfirm || canManage : canManage);

  return (
    <Boundary {...insp}>
      {insp.data ? (
        <>
          <Card
            title={`${insp.data.reference} · ${human(insp.data.type)}`}
            subtitle={`${insp.data.vehicle?.registrationNumber ?? insp.data.registrationNumber ?? insp.data.vehicleId} · v${insp.data.version}`}
            actions={<StatusTag status={insp.data.status} />}
          >
            <Feedback error={error} />
            <dl className="fg-insp__facts">
              {([
                ["Odometer", insp.data.odometer],
                ["Fuel level", insp.data.fuelLevel != null ? insp.data.fuelLevel + "%" : null],
                ["Exterior", insp.data.exteriorCondition],
                ["Interior", insp.data.interiorCondition],
                ["Existing damage", insp.data.existingDamage],
                ["New damage", insp.data.newDamage],
                ["Missing items", insp.data.missingItems],
                ["Receiving outcome", insp.data.receivingOutcome && human(insp.data.receivingOutcome)],
                ["Depot", insp.data.depot?.name],
                ["Organization", insp.data.organization?.name],
                ["Performed", when(insp.data.performedAt)],
                ["Submitted", when(insp.data.submittedAt)],
                ["Reviewed", when(insp.data.reviewedAt)],
                ["Review remarks", insp.data.reviewRemarks],
              ] as [string, string | number | null | undefined][]).map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{val ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="fg-insp__actions">
              <Link
                to={`/inspections/comparison?vehicleId=${insp.data.vehicleId}${insp.data.dispatchId ? "&dispatchId=" + insp.data.dispatchId : ""}`}
              >
                Open photo comparison
              </Link>
              {editable ? (
                <Button onClick={() => act(() => api.mutate(`/inspections/${id}/submit`))} loading={busy}>
                  Submit
                </Button>
              ) : null}
              {canReview && (insp.data.status === "SUBMITTED" || insp.data.status === "UNDER_REVIEW") ? (
                <>
                  <FormInput
                    label="Review remarks"
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                  />
                  <Button
                    onClick={() =>
                      act(() =>
                        api.mutate(`/inspections/${id}/review`, {
                          decision: "APPROVE",
                          remarks: reviewRemarks || "Approved",
                        }),
                      )
                    }
                    loading={busy}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      act(() =>
                        api.mutate(`/inspections/${id}/review`, {
                          decision: "REJECT",
                          remarks: reviewRemarks || "Rejected",
                        }),
                      )
                    }
                    loading={busy}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
              {canManage && insp.data.status === "APPROVED" ? (
                <Button onClick={() => act(() => api.mutate(`/inspections/${id}/complete`))} loading={busy}>
                  Complete
                </Button>
              ) : null}
              {canManage &&
              ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "COMPLETED"].includes(insp.data.status) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    act(async () => {
                      const a = await api.mutate<Inspection>(`/inspections/${id}/amend`);
                      insp.setData(a);
                    })
                  }
                  loading={busy}
                >
                  Create amendment
                </Button>
              ) : null}
            </div>
          </Card>

          <Card
            title="Condition photographs"
            subtitle="Original photographs are always retained, including on amended versions."
          >
            <div className="fg-insp__gallery">
              {(insp.data.photos ?? []).map((p) => (
                <figure key={p.id}>
                  <AuthedImage path={`/inspections/photos/${p.id}/download`} alt={p.category} />
                  <figcaption>
                    {human(p.category)}
                    {p.reused ? " · reused" : ""}
                    <br />
                    <span className="fg-insp__muted">{when(p.takenAt)}</span>
                  </figcaption>
                </figure>
              ))}
              {!(insp.data.photos ?? []).length ? (
                <p className="fg-insp__muted">No photographs captured.</p>
              ) : null}
            </div>
            {editable ? (
              <div className="fg-insp__inline">
                <Select
                  label="Category"
                  value={photoCategory}
                  options={PHOTO_CATEGORIES.map((c) => ({ label: human(c), value: c }))}
                  onChange={(e) => setPhotoCategory(e.target.value)}
                />
                <label className="fg-field">
                  <span className="fg-field__label">Add photograph</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}
          </Card>

          {insp.data.template?.items?.length ? (
            <Card title="Checklist">
              <ul className="fg-insp__checklist">
                {insp.data.template.items.map((it) => {
                  const r = (insp.data!.responses ?? []).find((x) => x.checklistItemId === it.id);
                  return (
                    <li key={it.id}>
                      {it.label}
                      {it.required ? " *" : ""} —{" "}
                      {r?.value ?? <span className="fg-insp__muted">no response</span>}
                      {it.photoRequired ? ` · photo: ${human(it.requiredPhotoCategory)}` : ""}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card title="Discrepancies">
            {(insp.data.discrepancies ?? []).map((x) => (
              <p key={x.id}>
                <Link to={`/inspections/discrepancies/${x.id}`}>{x.reference}</Link> ·{" "}
                {human(x.category)} · {human(x.severity)} · {human(x.status)}
              </p>
            ))}
            {!(insp.data.discrepancies ?? []).length ? (
              <p className="fg-insp__muted">No discrepancies linked to this inspection.</p>
            ) : null}
            {(canConfirm || canManage) && insp.data.type === "RECEIVING" ? (
              <form className="fg-insp__inline" onSubmit={createDiscrepancy}>
                <Select
                  label="Category"
                  value={disc.category}
                  options={DISCREPANCY_CATEGORIES.map((c) => ({ label: human(c), value: c }))}
                  onChange={(e) => setDisc((d) => ({ ...d, category: e.target.value }))}
                />
                <Select
                  label="Severity"
                  value={disc.severity}
                  options={SEVERITIES.map((s) => ({ label: human(s), value: s }))}
                  onChange={(e) => setDisc((d) => ({ ...d, severity: e.target.value }))}
                />
                <FormInput
                  label="Description"
                  required
                  value={disc.description}
                  onChange={(e) => setDisc((d) => ({ ...d, description: e.target.value }))}
                />
                <Button type="submit" variant="secondary" loading={busy} disabled={!disc.description}>
                  Record discrepancy
                </Button>
              </form>
            ) : null}
          </Card>
        </>
      ) : null}
    </Boundary>
  );
}
