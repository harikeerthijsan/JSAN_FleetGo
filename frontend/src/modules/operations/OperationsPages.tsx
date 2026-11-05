import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  BarChart,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  FormInput,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  type Column,
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { opsApi as api } from "@/services/operationsService";
import { downloadCsv } from "@/services/inventoryService";
import type {
  Allocation,
  AvailableVehicle,
  Dispatch,
  DispatchVehicle,
  Driver,
  OpsDashboard,
  OpsException,
  OpsLookups,
  Ref,
  RequestTicket,
  Trip,
} from "@/types/operations";
import "./Operations.css";
const msg = (e: unknown) =>
  (e as { message?: string })?.message ?? "Request failed. Please retry.";
const human = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "—";
const opts = (rows: Ref[] = []) => [
  { label: "Select…", value: "" },
  ...rows.map((r) => ({ label: r.name ?? r.fullName ?? r.id, value: r.id })),
];
function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, load };
}
function usePage<T>(
  path: string,
  page: number,
  params: Record<string, unknown> = {},
) {
  const key = JSON.stringify(params);
  const [data, setData] = useState<T[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const out = await api.list<T>(path, {
        page,
        pageSize: 20,
        ...JSON.parse(key),
      });
      setData(out.data);
      setTotal(out.meta.total);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [path, page, key]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, total, error, loading, load };
}
function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <p className="fg-ops__error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="fg-feedback" role="status">
          {success}
        </p>
      ) : null}
    </>
  );
}
function Boundary({
  loading,
  error,
  load,
  children,
  data,
}: {
  loading: boolean;
  error: string;
  load: () => void;
  children: ReactNode;
  data?: unknown;
}) {
  return loading && !data ? (
    <Spinner block label="Loading operations…" />
  ) : error && !data ? (
    <ErrorState
      title="Operations could not be loaded"
      description={error}
      action={<Button onClick={load}>Retry</Button>}
    />
  ) : (
    <>
      {error ? <Feedback error={error} /> : null}
      {children}
    </>
  );
}
function Protected({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? (
    <>{children}</>
  ) : (
    <ErrorState title="You do not have permission for this operation" />
  );
}
function Unsaved({ dirty }: { dirty: boolean }) {
  const { blocker } = useUnsavedChanges(dirty);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Discard unsaved edits?"
      message="Your changes have not been saved."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
    />
  );
}
function name(refs: Ref[] | undefined, id: string | null | undefined) {
  return refs?.find((r) => r.id === id)?.name ?? id ?? "—";
}
export function AllocationsPage() {
  useDocumentTitle("Vehicle Allocation");
  const { hasPermission } = useAuth();
  return (
    <div className="fg-ops">
      <PageTitle
        title="Vehicle allocation"
        description="Match approved requests with verified inventory."
      />
      <nav className="fg-ops__tabs">
        <NavLink end to="/allocations">
          Overview
        </NavLink>
        {hasPermission("allocation:manage") ? (
          <>
            <NavLink to="/allocations/queue">Approved ticket queue</NavLink>
            <NavLink to="/allocations/new">Create allocation</NavLink>
          </>
        ) : null}
        <NavLink to="/allocations/list">Allocations</NavLink>
        <NavLink to="/allocations/reports">Reports</NavLink>
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route
          path="queue"
          element={
            <Protected permission="allocation:manage">
              <TicketQueue />
            </Protected>
          }
        />
        <Route
          path="new"
          element={
            <Protected permission="allocation:manage">
              <CreateAllocation />
            </Protected>
          }
        />
        <Route path="list" element={<AllocationList />} />
        <Route path="reports" element={<Reports />} />
        <Route path=":id" element={<AllocationDetails />} />
      </Routes>
    </div>
  );
}
export function OperationsDispatchPage() {
  useDocumentTitle("Dispatch & Trips");
  const { hasPermission } = useAuth();
  return (
    <div className="fg-ops">
      <PageTitle
        title="Dispatch & trips"
        description="Departure readiness, transport custody and every milestone."
      />
      <nav className="fg-ops__tabs">
        {[
          ["", "Overview"],
          ["list", "Dispatches"],
          ["trips", "Trips"],
          ["exceptions", "Exceptions"],
          ["reports", "Reports"],
          ...(hasPermission("dispatch:manage")
            ? [
                ["new", "Create dispatch"],
                ["drivers", "Drivers"],
                ["transporters", "Transporters"],
              ]
            : []),
        ].map(([p, title]) => (
          <NavLink end={p === ""} key={p} to={`/dispatch${p ? "/" + p : ""}`}>
            {title}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="list" element={<DispatchList />} />
        <Route
          path="new"
          element={
            <Protected permission="dispatch:manage">
              <CreateDispatch />
            </Protected>
          }
        />
        <Route
          path="drivers"
          element={
            <Protected permission="dispatch:manage">
              <Drivers />
            </Protected>
          }
        />
        <Route path="transporters" element={<Transporters />} />
        <Route path="trips" element={<Trips />} />
        <Route path="trips/:id" element={<TripDetails />} />
        <Route path="exceptions" element={<Exceptions />} />
        <Route path="reports" element={<Reports />} />
        <Route path=":id" element={<DispatchDetails />} />
      </Routes>
    </div>
  );
}
function Dashboard() {
  const s = useLoad<OpsDashboard>("/dispatch/dashboard");
  const refs = useLoad<OpsLookups>("/dispatch/lookups");
  return (
    <Boundary {...s}>
      {s.data ? (
        <>
          <div className="fg-ops__heading">
            <h2>Operations at a glance</h2>
            <Button variant="secondary" onClick={s.load}>
              Refresh
            </Button>
          </div>
          <div className="fg-ops__metrics">
            {Object.entries({
              Allocations: s.data.totalAllocations,
              "Pending vehicle quantity": s.data.pendingAllocations,
              "Ready for dispatch": s.data.ready,
              "Dispatched today": s.data.dispatchedToday,
              "In transit": s.data.inTransit,
              "Delayed trips": s.data.delayed,
              Delivered: s.data.delivered,
              "Failed deliveries": s.data.failed,
            }).map(([k, v]) => (
              <Card key={k} title={k}>
                <strong>{v}</strong>
              </Card>
            ))}
          </div>
          <div className="fg-ops__grid">
            <Card title="Trips by status">
              <BarChart
                data={s.data.byStatus.map((r) => ({
                  ...r,
                  label: human(r.label),
                }))}
              />
            </Card>
            <Card title="Dispatches by depot">
              <BarChart
                data={s.data.byDepot.map((r) => ({
                  ...r,
                  label: name(refs.data?.depots, r.label),
                }))}
              />
            </Card>
            <Card title="Trips by transporter">
              <BarChart
                data={s.data.byTransporter.map((r) => ({
                  ...r,
                  label: name(refs.data?.organizations, r.label),
                }))}
              />
            </Card>
            <Card title="Delivery timing">
              <BarChart data={s.data.deliveryTiming} />
            </Card>
          </div>
        </>
      ) : null}
    </Boundary>
  );
}
function TicketQueue() {
  const s = useLoad<RequestTicket[]>("/allocations/queue");
  const columns: Column<RequestTicket>[] = [
    {
      key: "ticket",
      header: "Ticket",
      render: (t) => <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>,
    },
    { key: "subject", header: "Request", render: (t) => t.subject },
    { key: "requested", header: "Requested", render: (t) => t.requested },
    { key: "allocated", header: "Allocated", render: (t) => t.allocated },
    { key: "pending", header: "Pending", render: (t) => t.pending },
    {
      key: "action",
      header: "Action",
      render: (t) =>
        t.pending ? (
          <Link to={`/allocations/new?ticketId=${t.id}`}>
            Allocate vehicles
          </Link>
        ) : (
          <span>Fully allocated</span>
        ),
    },
  ];
  return (
    <Boundary {...s}>
      <Card title="Approved ticket queue">
        <DataTable
          columns={columns}
          rows={s.data ?? []}
          rowKey={(t) => t.id}
          emptyTitle="No approved tickets waiting"
        />
      </Card>
    </Boundary>
  );
}
function CreateAllocation() {
  const [url] = useSearchParams(),
    navigate = useNavigate();
  const queue = useLoad<RequestTicket[]>("/allocations/queue"),
    refs = useLoad<OpsLookups>("/allocations/lookups");
  const [data, setData] = useState<Record<string, string>>({
    ticketId: url.get("ticketId") ?? "",
    sourceDepotId: "",
    destinationDepotId: "",
    receivingOrgId: "",
    transporterId: "",
    plannedDispatchAt: "",
    expectedDeliveryAt: "",
  });
  const [filters, setFilters] = useState<Record<string, string>>({
    typeId: "",
    makeId: "",
    modelId: "",
    search: "",
    status: "AVAILABLE",
  });
  const [page, setPage] = useState(1);
  const choices = usePage<AvailableVehicle>("/allocations/available", page, {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    ...(data.sourceDepotId ? { depotId: data.sourceDepotId } : {}),
  });
  const [selected, setSelected] = useState<AvailableVehicle[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [dirty, setDirty] = useState(false);
  const guard = useUnsavedChanges(dirty),
    key = useRef(crypto.randomUUID());
  const set = (k: string, v: string) => {
    key.current = crypto.randomUUID();
    setDirty(true);
    setData((d) => ({ ...d, [k]: v }));
  };
  useEffect(() => {
    const t = queue.data?.find((t) => t.id === data.ticketId);
    if (t) {
      setData((d) => ({
        ...d,
        sourceDepotId: t.sourceDepotId ?? d.sourceDepotId,
        destinationDepotId: t.destinationDepotId ?? d.destinationDepotId,
        receivingOrgId: t.requestingOrgId,
      }));
      setFilters((f) => ({ ...f, typeId: t.requestedTypeId ?? "" }));
    }
  }, [queue.data, data.ticketId]);
  const ticket = queue.data?.find((t) => t.id === data.ticketId);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.mutate<Allocation>(
        "/allocations",
        {
          ...data,
          vehicleIds: selected.map((r) => r.vehicleId),
          plannedDispatchAt: new Date(data.plannedDispatchAt).toISOString(),
          expectedDeliveryAt: new Date(data.expectedDeliveryAt).toISOString(),
        },
        "post",
        key.current,
      );
      setDirty(false);
      guard.allowNavigation();
      navigate(`/allocations/${r.id}`);
    } catch (e) {
      setError(msg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const cols: Column<AvailableVehicle>[] = [
    {
      key: "select",
      header: "Select",
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Select ${r.vehicle.vehicleCode}`}
          checked={selected.some((v) => v.vehicleId === r.vehicleId)}
          disabled={busy || !r.eligible}
          onChange={(e) => {
            setDirty(true);
            key.current = crypto.randomUUID();
            setSelected((old) =>
              e.target.checked
                ? [...old, r]
                : old.filter((v) => v.vehicleId !== r.vehicleId),
            );
          }}
        />
      ),
    },
    {
      key: "code",
      header: "Vehicle",
      render: (r) => (
        <>
          <strong>{r.vehicle.vehicleCode}</strong>
          <p>{r.vehicle.registrationNumber}</p>
        </>
      ),
    },
    {
      key: "make",
      header: "Make/model",
      render: (r) =>
        `${r.vehicle.make?.name ?? "—"} ${r.vehicle.model?.name ?? ""}`,
    },
    { key: "type", header: "Type", render: (r) => r.vehicle.type?.name ?? "—" },
    {
      key: "depot",
      header: "Depot",
      render: (r) => name(refs.data?.depots, r.currentDepotId),
    },
    {
      key: "status",
      header: "Availability",
      render: r => <StatusBadge tone={r.eligible?"success":"warning"}>{human(r.vehicle.status)}{r.eligible?"":" ? Not eligible"}</StatusBadge>,
    },
  ];
  return (
    <Boundary
      loading={refs.loading || queue.loading}
      error={refs.error || queue.error}
      load={() => {
        refs.load();
        queue.load();
      }}
    >
      {refs.data ? (
        <>
          <Feedback error={error || choices.error} />
          <Card title="Allocation request">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selected.length) {
                  setError("Select at least one vehicle.");
                  return;
                }
                setConfirm(true);
              }}
            >
              <fieldset disabled={busy}>
                <div className="fg-ops__form">
                  <Select
                    label="Approved ticket"
                    required
                    value={data.ticketId}
                    options={[
                      { label: "Select…", value: "" },
                      ...(queue.data ?? [])
                        .filter((t) => t.pending > 0)
                        .map((t) => ({
                          label: `${t.ticketNumber} · ${t.subject} · ${t.pending} pending`,
                          value: t.id,
                        })),
                    ]}
                    onChange={(e) => {
                      set("ticketId", e.target.value);
                      setSelected([]);
                    }}
                  />
                  <Select
                    label="Source depot"
                    required
                    value={data.sourceDepotId}
                    options={opts(refs.data.depots)}
                    onChange={(e) => {
                      set("sourceDepotId", e.target.value);
                      setSelected([]);
                      setPage(1);
                    }}
                  />
                  <Select
                    label="Destination depot"
                    required
                    value={data.destinationDepotId}
                    options={opts(refs.data.depots)}
                    onChange={(e) => set("destinationDepotId", e.target.value)}
                  />
                  <Select
                    label="Receiving organization / vendor"
                    required
                    value={data.receivingOrgId}
                    options={opts(
                      refs.data.organizations.filter(
                        (o) => o.status === "ACTIVE",
                      ),
                    )}
                    onChange={(e) => set("receivingOrgId", e.target.value)}
                  />
                  <Select
                    label="Transport partner"
                    required
                    value={data.transporterId}
                    options={opts(
                      refs.data.organizations.filter(
                        (o) =>
                          o.type === "TRANSPORT_PARTNER" &&
                          o.status === "ACTIVE",
                      ),
                    )}
                    onChange={(e) => set("transporterId", e.target.value)}
                  />
                  <FormInput
                    label="Planned dispatch"
                    type="datetime-local"
                    required
                    value={data.plannedDispatchAt}
                    onChange={(e) => set("plannedDispatchAt", e.target.value)}
                  />
                  <FormInput
                    label="Expected delivery"
                    type="datetime-local"
                    required
                    value={data.expectedDeliveryAt}
                    onChange={(e) => set("expectedDeliveryAt", e.target.value)}
                  />
                </div>
                <p>
                  Requested {ticket?.requested ?? 0} · Allocated{" "}
                  {ticket?.allocated ?? 0} · Pending {ticket?.pending ?? 0} ·
                  Selected {selected.length}
                </p>
                <Button type="submit" disabled={!selected.length}>
                  Review allocation
                </Button>
              </fieldset>
            </form>
          </Card>
          <Card
            title="Available inventory selector"
            subtitle="Only available vehicles can be selected. Other status filters are for review; availability is checked again under locks."
          >
            <div className="fg-ops__form">
              <FormInput
                label="Search vehicle"
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setPage(1);
                }}
              />
              <Select label="Vehicle status" value={filters.status} options={['AVAILABLE','RESERVED','ALLOCATED','UNDER_MAINTENANCE','DAMAGED','INACTIVE','AT_VENDOR'].map(v=>({label:human(v),value:v}))} onChange={e=>{setFilters(f=>({...f,status:e.target.value}));setPage(1);}} />
              {(["typeId", "makeId", "modelId"] as const).map((field) => (
                <Select
                  key={field}
                  label={
                    field === "typeId"
                      ? "Type"
                      : field === "makeId"
                        ? "Make"
                        : "Model"
                  }
                  value={filters[field]}
                  options={[
                    { label: "All", value: "" },
                    ...refs.data![
                      field === "typeId"
                        ? "types"
                        : field === "makeId"
                          ? "makes"
                          : "models"
                    ].map((r) => ({ label: r.name, value: r.id })),
                  ]}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, [field]: e.target.value }));
                    setPage(1);
                  }}
                />
              ))}
            </div>
            <DataTable
              columns={cols}
              rows={choices.data}
              rowKey={(r) => r.vehicleId}
              loading={choices.loading}
              emptyTitle="No available vehicles match"
            />
            <Pagination
              page={page}
              pageSize={20}
              total={choices.total}
              onPageChange={setPage}
            />
          </Card>
          <ConfirmDialog
            open={confirm}
            title="Confirm allocation?"
            message={`Allocate ${selected.length} vehicles: ${selected.map((v) => `${v.vehicle.vehicleCode} (${v.vehicle.registrationNumber})`).join(", ")}. Remaining ticket quantity will stay pending.`}
            onConfirm={save}
            onCancel={() => !busy && setConfirm(false)}
            loading={busy}
          />
          <ConfirmDialog
            open={guard.blocker.state === "blocked"}
            title="Discard allocation edits?"
            message="Your allocation has not been confirmed."
            confirmLabel="Discard"
            onConfirm={() =>
              guard.blocker.state === "blocked" && guard.blocker.proceed()
            }
            onCancel={() =>
              guard.blocker.state === "blocked" && guard.blocker.reset()
            }
          />
        </>
      ) : null}
    </Boundary>
  );
}
function AllocationList() {
  const [page, setPage] = useState(1),
    s = usePage<Allocation>("/allocations", page);
  const cols: Column<Allocation>[] = [
    {
      key: "ref",
      header: "Allocation",
      render: (r) => <Link to={`/allocations/${r.id}`}>{r.reference}</Link>,
    },
    {
      key: "ticket",
      header: "Ticket",
      render: (r) => (
        <Link to={`/tickets/${r.ticketId}`}>{r.ticket.ticketNumber}</Link>
      ),
    },
    {
      key: "qty",
      header: "Vehicles",
      render: (r) => r.items.filter((i) => !i.cancelledAt).length,
    },
    { key: "status", header: "Status", render: (r) => human(r.state) },
    {
      key: "planned",
      header: "Planned departure",
      render: (r) => when(r.plannedDispatchAt),
    },
  ];
  return (
    <>
      <Feedback error={s.error} />
      <Card title="Vehicle allocations">
        <DataTable
          rows={s.data}
          columns={cols}
          rowKey={(r) => r.id}
          loading={s.loading}
          emptyTitle="No allocations"
        />
        <Pagination
          page={page}
          pageSize={20}
          total={s.total}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}
function AllocationDetails() {
  const { id } = useParams();
  const s = useLoad<Allocation>(`/allocations/${id}`),
    refs = useLoad<OpsLookups>("/allocations/lookups");
  const { hasPermission } = useAuth();
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await api.mutate(`/allocations/${id}/cancel`, { reason });
      setConfirm(false);
      s.load();
    } catch (e) {
      setError(msg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...s}>
      {s.data ? (
        <>
          <Feedback error={error} />
          <Card
            title={s.data.reference}
            subtitle={`${s.data.ticket.ticketNumber} · ${human(s.data.state)}`}
          >
            <dl className="fg-ops__facts">
              {Object.entries({
                Source: name(refs.data?.depots, s.data.sourceDepotId),
                Destination: name(refs.data?.depots, s.data.destinationDepotId),
                "Receiving organization": name(
                  refs.data?.organizations,
                  s.data.receivingOrgId,
                ),
                "Transport partner": name(
                  refs.data?.organizations,
                  s.data.transporterId,
                ),
                "Planned departure": when(s.data.plannedDispatchAt),
                "Expected delivery": when(s.data.expectedDeliveryAt),
                "Allocated by": s.data.allocatedById,
                "Allocated at": when(s.data.createdAt),
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <DataTable
              columns={[
                {
                  key: "code",
                  header: "Vehicle",
                  render: (r) => r.vehicleCode,
                },
                {
                  key: "registration",
                  header: "Registration",
                  render: (r) => r.registrationNumber,
                },
                {
                  key: "status",
                  header: "Current inventory status",
                  render: (r) => human(r.status),
                },
              ]}
              rows={s.data.vehicles ?? []}
              rowKey={(r) => r.id}
            />
            {hasPermission("dispatch:manage") &&
            s.data.state === "CONFIRMED" ? (
              <Link to={`/dispatch/new?allocationId=${id}`}>
                Create dispatch from this allocation
              </Link>
            ) : null}
            {s.data.dispatches.map((d) => (
              <p key={d.id}>
                <Link to={`/dispatch/${d.id}`}>{d.reference}</Link> · {d.state}
              </p>
            ))}
            {hasPermission("allocation:manage") &&
            s.data.state === "CONFIRMED" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirm(true);
                }}
              >
                <FormInput
                  label="Cancellation reason"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button type="submit" variant="danger">
                  Review cancellation
                </Button>
              </form>
            ) : null}
            {s.data.cancelReason ? <p>{s.data.cancelReason}</p> : null}
          </Card>
          <ConfirmDialog
            open={confirm}
            title="Cancel allocation?"
            message="Undispatched inventory will be released. Cancel associated dispatch plans first."
            loading={busy}
            onConfirm={cancel}
            onCancel={() => !busy && setConfirm(false)}
          />
        </>
      ) : null}
    </Boundary>
  );
}
function CreateDispatch() {
  const [url] = useSearchParams(),
    navigate = useNavigate();
  const [allocationId, setAllocationId] = useState(
    url.get("allocationId") ?? "",
  );
  const [page, setPage] = useState(1);
  const groups = usePage<Allocation>("/allocations", page),
    refs = useLoad<OpsLookups>("/dispatch/lookups");
  const detail = useLoad<Allocation>(
    allocationId ? `/allocations/${allocationId}` : null,
  );
  const [selected, setSelected] = useState<string[]>([]),
    [driverId, setDriverId] = useState(""),
    [address, setAddress] = useState(""),
    [transportVehicle, setTransportVehicle] = useState(""),
    [instructions, setInstructions] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [dirty, setDirty] = useState(false);
  const guard = useUnsavedChanges(dirty);
  const key = useRef(crypto.randomUUID());
  const edit = () => {
    key.current = crypto.randomUUID();
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api.mutate<Dispatch>(
        "/dispatch",
        {
          allocationId,
          allocationItemIds: selected,
          driverId,
          destinationAddress: address,
          transportVehicle: transportVehicle || undefined,
          instructions: instructions || undefined,
        },
        "post",
        key.current,
      );
      setDirty(false);
      guard.allowNavigation();
      navigate(`/dispatch/${d.id}`);
    } catch (e) {
      setError(msg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...refs}>
      {refs.data ? (
        <Card
          title="Plan a dispatch"
          subtitle="Select one or more vehicles from a confirmed allocation. A planned trip is created with the dispatch."
        >
          <Feedback error={error || groups.error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selected.length) {
                setError("Select allocation vehicles.");
                return;
              }
              setConfirm(true);
            }}
          >
            <fieldset disabled={busy}>
              <div className="fg-ops__form">
                <Select
                  label="Allocation"
                  required
                  value={allocationId}
                  options={[
                    { label: "Select…", value: "" },
                    ...[
                      ...groups.data,
                      ...(detail.data &&
                      !groups.data.some((g) => g.id === detail.data!.id)
                        ? [detail.data]
                        : []),
                    ]
                      .filter((g) => g.state === "CONFIRMED")
                      .map((g) => ({ label: g.reference, value: g.id })),
                  ]}
                  onChange={(e) => {
                    edit();
                    setAllocationId(e.target.value);
                    setSelected([]);
                  }}
                />
                <Select
                  label="Driver"
                  required
                  value={driverId}
                  options={[
                    { label: "Select…", value: "" },
                    ...refs.data.drivers
                      .filter(
                        (d) =>
                          d.status === "ACTIVE" &&
                          d.transporterId === detail.data?.transporterId,
                      )
                      .map((d) => ({
                        label: `${d.name} · ${d.phone}`,
                        value: d.id,
                      })),
                  ]}
                  onChange={(e) => {
                    edit();
                    setDriverId(e.target.value);
                  }}
                />
                <FormInput
                  label="Destination address / location"
                  required
                  value={address}
                  onChange={(e) => {
                    edit();
                    setAddress(e.target.value);
                  }}
                />
                <FormInput
                  label="Transport vehicle / carrier details"
                  value={transportVehicle}
                  onChange={(e) => {
                    edit();
                    setTransportVehicle(e.target.value);
                  }}
                />
                <FormInput
                  label="Special instructions"
                  value={instructions}
                  onChange={(e) => {
                    edit();
                    setInstructions(e.target.value);
                  }}
                />
              </div>
              <Pagination
                page={page}
                pageSize={20}
                total={groups.total}
                onPageChange={setPage}
              />
              {allocationId ? (
                <Boundary {...detail}>
                  {detail.data ? (
                    <>
                      <p>
                        {name(refs.data.depots, detail.data.sourceDepotId)} →{" "}
                        {name(refs.data.depots, detail.data.destinationDepotId)}{" "}
                        · {when(detail.data.plannedDispatchAt)} →{" "}
                        {when(detail.data.expectedDeliveryAt)}
                      </p>
                      {detail.data.items
                        .filter((i) => !i.cancelledAt)
                        .map((item) => (
                          <label className="fg-ops__check" key={item.id}>
                            <input
                              type="checkbox"
                              checked={selected.includes(item.id)}
                              onChange={(e) => {
                                edit();
                                setSelected((ids) =>
                                  e.target.checked
                                    ? [...ids, item.id]
                                    : ids.filter((id) => id !== item.id),
                                );
                              }}
                            />
                            {detail.data!.vehicles.find(
                              (v) => v.id === item.vehicleId,
                            )?.vehicleCode ?? item.vehicleId}{" "}
                            ·{" "}
                            {
                              detail.data!.vehicles.find(
                                (v) => v.id === item.vehicleId,
                              )?.registrationNumber
                            }
                          </label>
                        ))}
                    </>
                  ) : null}
                </Boundary>
              ) : null}
              <Button type="submit">Review dispatch plan</Button>
            </fieldset>
          </form>
          <ConfirmDialog
            open={confirm}
            title="Create dispatch and planned trip?"
            message={`Create a dispatch containing ${selected.length} allocated vehicles. Departure requires checklists and photographs.`}
            loading={busy}
            onConfirm={save}
            onCancel={() => !busy && setConfirm(false)}
          />
          <ConfirmDialog
            open={guard.blocker.state === "blocked"}
            title="Discard dispatch plan?"
            message="This plan has not been saved."
            onConfirm={() =>
              guard.blocker.state === "blocked" && guard.blocker.proceed()
            }
            onCancel={() =>
              guard.blocker.state === "blocked" && guard.blocker.reset()
            }
          />
        </Card>
      ) : null}
    </Boundary>
  );
}
function DispatchList() {
  const [page, setPage] = useState(1),
    s = usePage<Dispatch>("/dispatch", page);
  return (
    <>
      <Feedback error={s.error} />
      <Card title="Dispatch plans and departures">
        <DataTable
          columns={[
            {
              key: "ref",
              header: "Dispatch",
              render: (d) => (
                <Link to={`/dispatch/${d.id}`}>{d.reference}</Link>
              ),
            },
            {
              key: "ticket",
              header: "Ticket",
              render: (d) => d.allocation.ticket.ticketNumber,
            },
            { key: "status", header: "Status", render: (d) => human(d.state) },
            { key: "driver", header: "Driver", render: (d) => d.driver.name },
            {
              key: "trip",
              header: "Trip",
              render: (d) => (
                <Link to={`/dispatch/trips/${d.trip.id}`}>
                  {d.trip.reference}
                </Link>
              ),
            },
            {
              key: "expected",
              header: "Expected delivery",
              render: (d) => when(d.expectedDeliveryAt),
            },
          ]}
          rows={s.data}
          loading={s.loading}
          rowKey={(d) => d.id}
          emptyTitle="No dispatches"
        />
        <Pagination
          page={page}
          pageSize={20}
          total={s.total}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}
function DispatchDetails() {
  const { id } = useParams();
  const s = useLoad<Dispatch>(`/dispatch/${id}`),
    refs = useLoad<OpsLookups>("/dispatch/lookups");
  const { hasPermission } = useAuth();
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [action, setAction] = useState(""),
    [busy, setBusy] = useState(false),
    [driver, setDriver] = useState(""),
    [transporter, setTransporter] = useState(""),
    [reason, setReason] = useState("");
  const d = s.data;
  const editable =
    d &&
    ["PLANNED", "READY"].includes(d.state) &&
    hasPermission("dispatch:manage");
  const run = async (path: string, body: unknown = {}) => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(path, body);
      setSuccess("Operation saved.");
      setAction("");
      s.load();
    } catch (e) {
      setError(msg(e));
      setAction("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...s}>
      {d ? (
        <>
          <Feedback error={error} success={success} />
          <div className="fg-ops__heading">
            <h2>
              {d.reference} · {human(d.state)}
            </h2>
            <Button variant="secondary" onClick={s.load}>
              Refresh
            </Button>
          </div>
          <Card title="Dispatch details">
            <dl className="fg-ops__facts">
              {Object.entries({
                Ticket: d.allocation.ticket.ticketNumber,
                Allocation: d.allocation.reference,
                Source: name(refs.data?.depots, d.sourceDepotId),
                Destination: `${name(refs.data?.depots, d.destinationDepotId)} · ${d.destinationAddress}`,
                Transporter: name(refs.data?.organizations, d.transporterId),
                Driver: `${d.driver.name} · ${d.driver.phone}`,
                "License valid through": when(d.driver.licenseExpiry),
                "Planned departure": when(d.plannedDispatchAt),
                "Expected delivery": when(d.expectedDeliveryAt),
                "Actual departure": when(d.confirmedAt),
                "Transport vehicle": d.transportVehicle ?? "—",
                Instructions: d.instructions ?? "—",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <Link to={`/dispatch/trips/${d.trip.id}`}>
              Open {d.trip.reference} · {human(d.trip.status)}
            </Link>
          </Card>
          {d.vehicles.map((v) => (
            <Checklist
              key={v.id}
              dispatchId={d.id}
              value={v}
              title={`${d.vehicleDetails?.find((x) => x.id === v.vehicleId)?.vehicleCode ?? v.vehicleId} · ${d.vehicleDetails?.find((x) => x.id === v.vehicleId)?.registrationNumber ?? ""}`}
              editable={Boolean(editable)}
              saved={s.load}
            />
          ))}
          <Evidence dispatch={d} editable={Boolean(editable)} saved={s.load} />
          {editable && refs.data ? (
            <Card
              title="Driver / transporter reassignment"
              subtitle="Assignment history is preserved. Reassignment is available before departure."
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setAction("assignment");
                }}
              >
                <div className="fg-ops__form">
                  <Select
                    label="Transport partner"
                    required
                    value={transporter || d.transporterId}
                    options={opts(
                      refs.data.organizations.filter(
                        (o) =>
                          o.type === "TRANSPORT_PARTNER" &&
                          o.status === "ACTIVE",
                      ),
                    )}
                    onChange={(e) => {
                      setTransporter(e.target.value);
                      setDriver("");
                    }}
                  />
                  <Select
                    label="Driver"
                    required
                    value={driver}
                    options={[
                      { label: "Select…", value: "" },
                      ...refs.data.drivers
                        .filter(
                          (r) =>
                            r.transporterId ===
                              (transporter || d.transporterId) &&
                            r.status === "ACTIVE",
                        )
                        .map((r) => ({
                          label: `${r.name} · ${r.phone}`,
                          value: r.id,
                        })),
                    ]}
                    onChange={(e) => setDriver(e.target.value)}
                  />
                  <FormInput
                    label="Reassignment reason"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={busy}>
                  Review assignment
                </Button>
              </form>
            </Card>
          ) : null}
          <Card title="Transport assignment history">
            {d.assignments.map((a) => (
              <p key={a.id}>
                {when(a.createdAt)} ·{" "}
                {name(refs.data?.organizations, a.transporterId)} ·{" "}
                {refs.data?.drivers.find((r) => r.id === a.driverId)?.name ??
                  a.driverId}{" "}
                · {a.reason}
              </p>
            ))}
          </Card>
          {editable ? (
            <div className="fg-ops__actions">
              <Button
                variant="secondary"
                disabled={busy || d.state === "READY"}
                onClick={() => setAction("ready")}
              >
                Validate ready for dispatch
              </Button>
              <Button disabled={busy} onClick={() => setAction("confirm")}>
                Confirm departure
              </Button>
              <Link to={`/dispatch/trips/${d.trip.id}`}>
                Cancel plan through trip management
              </Link>
            </div>
          ) : null}
          <ConfirmDialog
            open={Boolean(action)}
            title={
              action === "confirm"
                ? "Confirm physical departure?"
                : action === "ready"
                  ? "Validate departure readiness?"
                  : "Confirm driver reassignment?"
            }
            message={
              action === "confirm"
                ? "Inventory will enter transport custody, movement records will be created, and the trip will become Dispatched."
                : action === "ready"
                  ? "Every checklist, license, allocation and required photograph will be checked."
                  : reason
            }
            loading={busy}
            onConfirm={() =>
              void run(
                `/dispatch/${d.id}/${action}`,
                action === "assignment"
                  ? {
                      driverId: driver,
                      transporterId: transporter || d.transporterId,
                      reason,
                    }
                  : {},
              )
            }
            onCancel={() => !busy && setAction("")}
          />
        </>
      ) : null}
    </Boundary>
  );
}
function Checklist({
  dispatchId,
  value,
  title,
  editable,
  saved,
}: {
  dispatchId: string;
  value: DispatchVehicle;
  title: string;
  editable: boolean;
  saved: () => void;
}) {
  const [data, setData] = useState({
    ...value,
    odometer: value.odometer === null ? "" : String(value.odometer),
    fuelLevel: value.fuelLevel === null ? "" : String(value.fuelLevel),
    accessories: value.accessories ?? "",
    remarks: value.remarks ?? "",
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        `/dispatch/${dispatchId}/checklist/${value.vehicleId}`,
        {
          identityVerified: data.identityVerified,
          registrationVerified: data.registrationVerified,
          odometer: Number(data.odometer),
          fuelLevel: Number(data.fuelLevel),
          accessories: data.accessories,
          keysHandedOver: data.keysHandedOver,
          documentsHandedOver: data.documentsHandedOver,
          remarks: data.remarks,
        },
        "put",
      );
      setNotice("Checklist saved.");
      saved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={`Dispatch checklist · ${title}`}>
      <Feedback error={error} success={notice} />
      <form onSubmit={save}>
        <fieldset disabled={!editable || busy}>
          <div className="fg-ops__form">
            {(
              [
                "identityVerified",
                "registrationVerified",
                "keysHandedOver",
                "documentsHandedOver",
              ] as const
            ).map((k) => (
              <label key={k} className="fg-ops__check">
                <input
                  type="checkbox"
                  checked={data[k]}
                  onChange={(e) =>
                    setData((d) => ({ ...d, [k]: e.target.checked }))
                  }
                />
                {
                  {
                    identityVerified: "Vehicle identity verified",
                    registrationVerified: "Registration verified",
                    keysHandedOver: "Keys handed over",
                    documentsHandedOver: "Documents handed over",
                  }[k]
                }
              </label>
            ))}
            <FormInput
              label="Odometer (km)"
              required
              type="number"
              min={0}
              value={data.odometer}
              onChange={(e) =>
                setData((d) => ({ ...d, odometer: e.target.value }))
              }
            />
            <FormInput
              label="Fuel level (%)"
              required
              type="number"
              min={0}
              max={100}
              value={data.fuelLevel}
              onChange={(e) =>
                setData((d) => ({ ...d, fuelLevel: e.target.value }))
              }
            />
            <FormInput
              label="Accessories / equipment"
              required
              value={data.accessories}
              onChange={(e) =>
                setData((d) => ({ ...d, accessories: e.target.value }))
              }
              hint="Enter None if no accessories were handed over."
            />
            <FormInput
              label="Dispatch remarks"
              value={data.remarks}
              onChange={(e) =>
                setData((d) => ({ ...d, remarks: e.target.value }))
              }
            />
          </div>
          {editable ? (
            <Button type="submit" loading={busy}>
              Save checklist
            </Button>
          ) : null}
        </fieldset>
      </form>
    </Card>
  );
}
function Evidence({
  dispatch,
  editable,
  saved,
  exceptionId,
}: {
  dispatch: Dispatch;
  editable: boolean;
  saved: () => void;
  exceptionId?: string;
}) {
  const [vehicleId, setVehicleId] = useState(""),
    [category, setCategory] = useState(exceptionId ? "EXCEPTION" : "FRONT"),
    [remarks, setRemarks] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const upload = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      for (const f of files)
        await api.upload(`/dispatch/${dispatch.id}/evidence`, f, {
          vehicleId,
          category,
          remarks,
          ...(exceptionId ? { exceptionId } : {}),
        });
      setFiles([]);
      saved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={
        exceptionId
          ? "Exception evidence"
          : "Dispatch photographs and documents"
      }
      subtitle="Original images are retained with uploader, timestamp, category and vehicle/dispatch references."
    >
      <Feedback error={error} />
      <ul className="fg-ops__timeline">
        {dispatch.evidence
          .filter((e) =>
            exceptionId ? e.exceptionId === exceptionId : !e.exceptionId,
          )
          .map((e) => (
            <li key={e.id}>
              <Button
                variant="ghost"
                onClick={() =>
                  void api
                    .download(`/dispatch/evidence/${e.id}/download`, e.fileName)
                    .catch((e) => setError(msg(e)))
                }
              >
                {e.fileName}
              </Button>
              <p>
                {e.category} · {when(e.createdAt)} · {e.remarks}
              </p>
            </li>
          ))}
      </ul>
      {editable ? (
        <form onSubmit={upload}>
          <fieldset disabled={busy}>
            <div className="fg-ops__form">
              <Select
                label="Vehicle reference"
                required={["FRONT", "REAR", "SIDE", "INTERIOR"].includes(
                  category,
                )}
                value={vehicleId}
                options={[
                  { label: "Whole dispatch / select vehicle", value: "" },
                  ...dispatch.vehicles.map((v) => ({
                    label:
                      dispatch.vehicleDetails?.find((r) => r.id === v.vehicleId)
                        ?.vehicleCode ?? v.vehicleId,
                    value: v.vehicleId,
                  })),
                ]}
                onChange={(e) => setVehicleId(e.target.value)}
              />
              <Select
                label="Photo / document category"
                value={category}
                options={(exceptionId
                  ? ["EXCEPTION"]
                  : ["FRONT", "REAR", "SIDE", "INTERIOR", "DOCUMENT"]
                ).map((c) => ({ label: human(c), value: c }))}
                onChange={(e) => setCategory(e.target.value)}
              />
              <FormInput
                label="Remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <FormInput
                label="Images / PDF"
                type="file"
                multiple
                required
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </div>
            <Button type="submit" loading={busy} disabled={!files.length}>
              Upload originals
            </Button>
          </fieldset>
        </form>
      ) : null}
    </Card>
  );
}
function Trips() {
  const [url] = useSearchParams();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("");
  const s = usePage<Trip>("/trips", page, {
    ...(status ? { status } : {}),
    ...(url.get("transporterId")
      ? { transporterId: url.get("transporterId") }
      : {}),
  });
  return (
    <>
      <Select
        label="Trip status"
        value={status}
        options={[
          { label: "All", value: "" },
          ...[
            "PLANNED",
            "READY_FOR_DISPATCH",
            "DISPATCHED",
            "IN_TRANSIT",
            "DELAYED",
            "DELIVERY_ATTEMPTED",
            "DELIVERED",
            "FAILED_DELIVERY",
            "CANCELLED",
          ].map((v) => ({ label: human(v), value: v })),
        ]}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      />
      <Feedback error={s.error} />
      <Card title="Trip management">
        <DataTable
          columns={[
            {
              key: "ref",
              header: "Trip",
              render: (t) => (
                <Link to={`/dispatch/trips/${t.id}`}>{t.reference}</Link>
              ),
            },
            {
              key: "dispatch",
              header: "Dispatch",
              render: (t) => (
                <Link to={`/dispatch/${t.dispatchId}`}>
                  {t.dispatch.reference}
                </Link>
              ),
            },
            {
              key: "driver",
              header: "Driver",
              render: (t) => t.dispatch.driver.name,
            },
            { key: "status", header: "Status", render: (t) => human(t.status) },
            {
              key: "start",
              header: "Actual start",
              render: (t) => when(t.actualStartAt),
            },
            {
              key: "arrival",
              header: "Expected arrival",
              render: (t) => when(t.dispatch.expectedDeliveryAt),
            },
            {
              key: "delay",
              header: "Delay",
              render: (t) => `${t.delayMinutes} min`,
            },
          ]}
          rows={s.data}
          rowKey={(t) => t.id}
          loading={s.loading}
          emptyTitle="No trips in your scope"
        />
        <Pagination
          page={page}
          pageSize={20}
          total={s.total}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}
const tripNext: Record<string, string[]> = {
  PLANNED: ["CANCELLED"],
  READY_FOR_DISPATCH: ["CANCELLED"],
  DISPATCHED: [
    "IN_TRANSIT",
    "DELAYED",
    "DELIVERY_ATTEMPTED",
    "FAILED_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ],
  IN_TRANSIT: [
    "DELAYED",
    "DELIVERY_ATTEMPTED",
    "FAILED_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ],
  DELAYED: [
    "IN_TRANSIT",
    "DELIVERY_ATTEMPTED",
    "FAILED_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ],
  DELIVERY_ATTEMPTED: [
    "IN_TRANSIT",
    "DELAYED",
    "DELIVERED",
    "FAILED_DELIVERY",
    "CANCELLED",
  ],
  FAILED_DELIVERY: ["IN_TRANSIT", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
function TripDetails() {
  const { id } = useParams();
  const s = useLoad<Trip>(`/trips/${id}`),
    refs = useLoad<OpsLookups>("/dispatch/lookups");
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState(""),
    [reason, setReason] = useState(""),
    [delay, setDelay] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/trips/${id}/status`, {
        status,
        reason,
        delayMinutes: Number(delay),
      });
      setConfirm(false);
      setReason("");
      setStatus("");
      s.load();
    } catch (e) {
      setError(msg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...s}>
      {s.data ? (
        <>
          <Feedback error={error} />
          <Card title={`${s.data.reference} · ${human(s.data.status)}`}>
            <dl className="fg-ops__facts">
              {Object.entries({
                Dispatch: s.data.dispatch.reference,
                Ticket: s.data.dispatch.allocation.ticket.ticketNumber,
                Driver: `${s.data.dispatch.driver.name} · ${s.data.dispatch.driver.phone}`,
                Transporter: name(
                  refs.data?.organizations,
                  s.data.dispatch.transporterId,
                ),
                Route: `${name(refs.data?.depots, s.data.dispatch.sourceDepotId)} → ${name(refs.data?.depots, s.data.dispatch.destinationDepotId)}`,
                "Planned start": when(s.data.dispatch.plannedDispatchAt),
                "Actual start": when(s.data.actualStartAt),
                "Expected arrival": when(s.data.dispatch.expectedDeliveryAt),
                "Actual arrival": when(s.data.actualArrivalAt),
                Delay: `${s.data.delayMinutes} minutes`,
                "Tracking integration": s.data.trackingReady
                  ? "Available for GPS device mapping"
                  : "Not active",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>{s.data.remarks}</p>
            <p><Link to={'/tracking/history?tripId='+s.data.id}>GPS tracking history and recorded route replay</Link> · <Link to="/tracking/devices">Map a device for this active trip</Link></p>
            <ul>
              {s.data.dispatch.vehicleDetails?.map((v) => (
                <li key={v.id}>
                  {v.vehicleCode} · {v.registrationNumber}
                </li>
              ))}
            </ul>
            <Link to={`/dispatch/${s.data.dispatchId}`}>
              Dispatch evidence and checklists
            </Link>
          </Card>
          {(hasPermission("dispatch:manage") ||
            hasPermission("trips:update")) &&
          (tripNext[s.data.status]?.length ?? 0) > 0 ? (
            <Card title="Report trip milestone">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirm(true);
                }}
              >
                <fieldset disabled={busy}>
                  <div className="fg-ops__form">
                    <Select
                      label="Next status"
                      required
                      value={status}
                      options={[
                        { label: "Select…", value: "" },
                        ...(tripNext[s.data.status] ?? [])
                          .filter(
                            (v) =>
                              v !== "CANCELLED" ||
                              hasPermission("dispatch:manage"),
                          )
                          .map((v) => ({ label: human(v), value: v })),
                      ]}
                      onChange={(e) => setStatus(e.target.value)}
                    />
                    <FormInput
                      label="Reason / remarks"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <FormInput
                      label="Delay minutes"
                      type="number"
                      min={0}
                      value={delay}
                      onChange={(e) => setDelay(e.target.value)}
                    />
                  </div>
                  <Button type="submit">Review milestone</Button>
                </fieldset>
              </form>
              <p>
                Delivery records arrival and custody only. It does not perform
                receiving inspection or mark inventory available. Cancellation
                after departure retains transport custody pending explicit
                recovery.
              </p>
            </Card>
          ) : null}
          <Card title="Complete trip timeline">
            <ol className="fg-ops__timeline">
              {s.data.events.map((e) => (
                <li key={e.id}>
                  <strong>{human(e.type)}</strong>
                  <p>{e.description}</p>
                  <small>
                    {when(e.occurredAt)} · {e.actorId}
                    {e.toStatus ? ` · ${human(e.toStatus)}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          </Card>
          <ExceptionCreate tripId={s.data.id} saved={s.load} />
          {s.data.exceptions.map((e) => (
            <Card key={e.id} title={`${human(e.type)} · ${e.status}`}>
              <p>
                {e.description} · {e.severity}
              </p>
              <p>{e.resolutionNotes}</p>
              <Evidence
                dispatch={s.data!.dispatch}
                exceptionId={e.id}
                editable={
                  hasPermission("dispatch:manage") ||
                  hasPermission("trips:update")
                }
                saved={s.load}
              />
            </Card>
          ))}
          <ConfirmDialog
            open={confirm}
            title={`Set trip to ${human(status)}?`}
            message={reason}
            onConfirm={save}
            onCancel={() => !busy && setConfirm(false)}
            loading={busy}
          />
        </>
      ) : null}
    </Boundary>
  );
}
function Drivers() {
  const s = useLoad<Driver[]>("/dispatch/drivers"),
    refs = useLoad<OpsLookups>("/dispatch/lookups");
  const [id, setId] = useState(""),
    [data, setData] = useState<Record<string, string>>({
      name: "",
      phone: "",
      licenseNumber: "",
      licenseExpiry: "",
      transporterId: "",
      userId: "",
      status: "ACTIVE",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const key = useRef(crypto.randomUUID());
  const set = (k: string, v: string) => {
    setDirty(true);
    key.current = crypto.randomUUID();
    setData((d) => ({ ...d, [k]: v }));
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        `/dispatch/drivers${id ? "/" + id : ""}`,
        {
          ...data,
          userId: data.userId || null,
          licenseExpiry: new Date(data.licenseExpiry).toISOString(),
        },
        id ? "put" : "post",
        key.current,
      );
      setDirty(false);
      setId("");
      setData({
        name: "",
        phone: "",
        licenseNumber: "",
        licenseExpiry: "",
        transporterId: "",
        userId: "",
        status: "ACTIVE",
      });
      s.load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Feedback error={error || refs.error} />
      <Boundary {...s}>
        <Card title="Driver management">
          <DataTable
            columns={[
              { key: "name", header: "Driver", render: (d) => d.name },
              { key: "phone", header: "Contact", render: (d) => d.phone },
              {
                key: "license",
                header: "License / expiry",
                render: (d) => `${d.licenseNumber} · ${when(d.licenseExpiry)}`,
              },
              {
                key: "partner",
                header: "Transport partner",
                render: (d) => name(refs.data?.organizations, d.transporterId),
              },
              { key: "status", header: "Status", render: (d) => d.status },
              {
                key: "edit",
                header: "Edit",
                render: (d) => (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setId(d.id);
                      setData({
                        ...d,
                        userId: d.userId ?? "",
                        licenseExpiry: localDate(d.licenseExpiry),
                      });
                      key.current = crypto.randomUUID();
                    }}
                  >
                    Edit
                  </Button>
                ),
              },
            ]}
            rows={s.data ?? []}
            rowKey={(d) => d.id}
            emptyTitle="No drivers registered"
          />
        </Card>
      </Boundary>
      {refs.data ? (
        <Card title={id ? "Edit driver" : "Register driver"}>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="fg-ops__form">
                {[
                  ["name", "Driver name"],
                  ["phone", "Contact phone"],
                  ["licenseNumber", "License number"],
                ].map(([k, title]) => (
                  <FormInput
                    key={k}
                    label={title}
                    required
                    value={data[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                ))}
                <FormInput
                  label="License expires at"
                  type="datetime-local"
                  required
                  value={data.licenseExpiry}
                  onChange={(e) => set("licenseExpiry", e.target.value)}
                />
                <Select
                  label="Transport partner"
                  required
                  value={data.transporterId}
                  options={opts(
                    refs.data.organizations.filter(
                      (o) => o.type === "TRANSPORT_PARTNER",
                    ),
                  )}
                  onChange={(e) => {
                    set("transporterId", e.target.value);
                    set("userId", "");
                  }}
                />
                <Select
                  label="Linked driver account (optional)"
                  value={data.userId}
                  options={opts(
                    refs.data.users
                      .filter((u) => u.organizationId === data.transporterId)
                      .map((u) => ({ ...u, name: u.fullName ?? u.name })),
                  )}
                  onChange={(e) => set("userId", e.target.value)}
                />
                <Select
                  label="Status"
                  value={data.status}
                  options={["ACTIVE", "INACTIVE"].map((v) => ({
                    label: human(v),
                    value: v,
                  }))}
                  onChange={(e) => set("status", e.target.value)}
                />
              </div>
              <Button type="submit" loading={busy}>
                Save driver
              </Button>
            </fieldset>
          </form>
          <p>
            Only a linked account can report milestones for its assigned trips.
          </p>
        </Card>
      ) : null}
      <Unsaved dirty={dirty} />
    </>
  );
}
function Transporters() {
  const s = useLoad<Ref[]>("/dispatch/transporters");
  const { hasPermission } = useAuth();
  const [edit, setEdit] = useState<Ref | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        `/dispatch/transporters/${edit.id}`,
        {
          contactName: edit.contactName ?? "",
          contactPhone: edit.contactPhone ?? "",
          contactEmail: edit.contactEmail,
          status: edit.status,
        },
        "put",
      );
      setEdit(null);
      s.load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...s}>
      <Feedback error={error} />
      <Card
        title="Transport partner organizations"
        subtitle="Existing Organization records are reused. No duplicate transporter master is created."
      >
        <DataTable
          columns={[
            { key: "name", header: "Partner", render: (o) => o.name },
            {
              key: "contact",
              header: "Contact",
              render: (o) =>
                `${o.contactName ?? "—"} · ${o.contactPhone ?? "—"}`,
            },
            {
              key: "email",
              header: "Email",
              render: (o) => o.contactEmail ?? "—",
            },
            { key: "status", header: "Status", render: (o) => o.status },
            {
              key: "trips",
              header: "Assigned trips",
              render: (o) => (
                <Link to={`/dispatch/trips?transporterId=${o.id}`}>
                  View trips
                </Link>
              ),
            },
            {
              key: "edit",
              header: "Action",
              render: (o) =>
                hasPermission("dispatch:manage") ? (
                  <Button variant="ghost" onClick={() => setEdit(o)}>
                    Edit contact/status
                  </Button>
                ) : null,
            },
          ]}
          rows={s.data ?? []}
          rowKey={(o) => o.id}
          emptyTitle="No transport partners"
        />
      </Card>
      {edit ? (
        <Card title={`Update ${edit.name}`}>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="fg-ops__form">
                {(["contactName", "contactPhone", "contactEmail"] as const).map(
                  (k) => (
                    <FormInput
                      key={k}
                      type={k === "contactEmail" ? "email" : "text"}
                      required={k === "contactEmail"}
                      label={k}
                      value={edit[k] ?? ""}
                      onChange={(e) =>
                        setEdit((v) => (v ? { ...v, [k]: e.target.value } : v))
                      }
                    />
                  ),
                )}
                <Select
                  label="Status"
                  value={edit.status ?? "ACTIVE"}
                  options={["ACTIVE", "INACTIVE"].map((v) => ({
                    label: human(v),
                    value: v,
                  }))}
                  onChange={(e) =>
                    setEdit((v) => (v ? { ...v, status: e.target.value } : v))
                  }
                />
              </div>
              <div className="fg-ops__actions">
                <Button type="submit" loading={busy}>
                  Save partner
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEdit(null)}
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        </Card>
      ) : null}
    </Boundary>
  );
}
const exceptionTypes = [
  "DISPATCH_DELAY",
  "DRIVER_UNAVAILABLE",
  "TRANSPORTER_UNAVAILABLE",
  "VEHICLE_UNAVAILABLE",
  "BREAKDOWN",
  "TRIP_CANCELLATION",
  "FAILED_DELIVERY",
  "INCORRECT_DESTINATION",
  "MISSING_DOCUMENTS",
];
function ExceptionCreate({
  tripId,
  saved,
}: {
  tripId: string;
  saved: () => void;
}) {
  const { hasPermission } = useAuth();
  const [type, setType] = useState("DISPATCH_DELAY"),
    [description, setDescription] = useState(""),
    [severity, setSeverity] = useState("MEDIUM"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!hasPermission("dispatch:manage") && !hasPermission("trips:update"))
    return null;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.mutate("/dispatch/exceptions", {
        tripId,
        type,
        description,
        severity,
      });
      setDescription("");
      saved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="Report operational exception"
      subtitle="Reporting an exception sends an operations notification and creates a timeline entry. It does not change trip or inventory status."
    >
      <Feedback error={error} />
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="fg-ops__form">
            <Select
              label="Exception type"
              value={type}
              options={exceptionTypes.map((v) => ({
                label: human(v),
                value: v,
              }))}
              onChange={(e) => setType(e.target.value)}
            />
            <Select
              label="Severity"
              value={severity}
              options={["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((v) => ({
                label: human(v),
                value: v,
              }))}
              onChange={(e) => setSeverity(e.target.value)}
            />
            <FormInput
              label="Description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy}>
            Record exception
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
function Exceptions() {
  const s = useLoad<OpsException[]>("/dispatch/exceptions");
  const { hasPermission } = useAuth();
  const [selected, setSelected] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const resolve = async () => {
    setBusy(true);
    try {
      await api.mutate(`/dispatch/exceptions/${selected}/resolve`, {
        resolutionNotes: notes,
      });
      setConfirm(false);
      setSelected("");
      setNotes("");
      s.load();
    } catch (e) {
      setError(msg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Boundary {...s}>
      <Feedback error={error} />
      <Card title="Operational exceptions">
        <DataTable
          columns={[
            {
              key: "trip",
              header: "Trip",
              render: (e) => (
                <Link to={`/dispatch/trips/${e.tripId}`}>
                  {e.trip?.reference ?? e.tripId}
                </Link>
              ),
            },
            { key: "type", header: "Type", render: (e) => human(e.type) },
            {
              key: "description",
              header: "Description",
              render: (e) => e.description,
            },
            {
              key: "severity",
              header: "Severity",
              render: (e) => (
                <StatusBadge
                  tone={
                    ["HIGH", "CRITICAL"].includes(e.severity)
                      ? "danger"
                      : "warning"
                  }
                >
                  {e.severity}
                </StatusBadge>
              ),
            },
            {
              key: "state",
              header: "Status",
              render: (e) =>
                `${e.status}${e.resolutionNotes ? ` · ${e.resolutionNotes}` : ""}`,
            },
            {
              key: "time",
              header: "Reported",
              render: (e) => when(e.createdAt),
            },
            {
              key: "resolve",
              header: "Action",
              render: (e) =>
                hasPermission("dispatch:manage") && e.status === "OPEN" ? (
                  <Button variant="ghost" onClick={() => setSelected(e.id)}>
                    Resolve
                  </Button>
                ) : null,
            },
          ]}
          rows={s.data ?? []}
          rowKey={(e) => e.id}
          emptyTitle="No operational exceptions"
        />
      </Card>
      {selected ? (
        <Card title="Resolve exception">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            <FormInput
              label="Resolution notes"
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit" loading={busy}>
              Review resolution
            </Button>
          </form>
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title="Resolve this exception?"
        message={notes}
        onConfirm={resolve}
        onCancel={() => !busy && setConfirm(false)}
        loading={busy}
      />
    </Boundary>
  );
}
function Reports() {
  const s = useLoad<OpsDashboard>("/dispatch/reports");
  return (
    <Boundary {...s}>
      {s.data ? (
        <Card
          title="Allocation and dispatch reports"
          subtitle="Reports use scoped database records. Export the summary or browse the paginated operational registers."
        >
          <div className="fg-ops__actions">
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  Object.entries({
                    totalAllocations: s.data!.totalAllocations,
                    pendingVehicleQuantity: s.data!.pendingAllocations,
                    readyForDispatch: s.data!.ready,
                    dispatchedToday: s.data!.dispatchedToday,
                    inTransit: s.data!.inTransit,
                    delayedTrips: s.data!.delayed,
                    delivered: s.data!.delivered,
                    failedDeliveries: s.data!.failed,
                  }).map(([metric, count]) => ({ metric, count })),
                  "allocation-dispatch-summary.csv",
                )
              }
            >
              Export operational summary
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  s.data!.byStatus.map((r) => ({
                    tripStatus: r.label,
                    count: r.count,
                  })),
                  "trips-by-status.csv",
                )
              }
            >
              Export trip status report
            </Button>
            <Link to="/allocations/list">Allocation register</Link>
            <Link to="/dispatch/trips">Trip register</Link>
          </div>
          <BarChart data={s.data.deliveryTiming} />
        </Card>
      ) : null}
    </Boundary>
  );
}
