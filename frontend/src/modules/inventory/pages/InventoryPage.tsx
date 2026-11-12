import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
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
  DonutChart,
  ErrorState,
  FormInput,
  Icon,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  type Column,
  type ChartDatum,
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { RequirePermission } from '@/routes/guards';
import { VehicleFormPage } from '@/modules/fleet/pages/VehicleFormPage';
import { VehicleDetailsPage } from '@/modules/fleet/pages/VehicleDetailsPage';
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { inventoryApi as api, downloadCsv } from "@/services/inventoryService";
import { STATUS_COLORS, statusLabel } from "@/modules/fleet/statusMeta";
import type { VehicleStatus } from "@/types/vehicle";
import type {
  Evidence,
  ImportRow,
  InventoryDashboard,
  InventoryDetails,
  InventoryLookups,
  InventoryRecord,
  Lookup,
  Movement,
  Reconciliation,
  ReconciliationItem,
  Reservation,
} from "@/types/inventory";
import "./InventoryPage.css";
const message = (e: unknown) =>
  (e as { message?: string })?.message ??
  "The request failed. Please try again.";
const date = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "—";
const friendly = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
const options = (rows: Lookup[] = []) => [
  { label: "Select…", value: "" },
  ...rows.map((r) => ({ label: r.name, value: r.id })),
];
const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const toIso = (s: string) => new Date(s).toISOString();
function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, load };
}
function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <div className="fg-inventory__error" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <p className="fg-feedback" role="status">
          {success}
        </p>
      ) : null}
    </>
  );
}
function LoadBoundary({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
}) {
  return loading ? (
    <Spinner block label="Loading inventory…" />
  ) : error ? (
    <ErrorState
      title="Inventory could not be loaded"
      description={error}
      action={<Button onClick={retry}>Retry</Button>}
    />
  ) : (
    <>{children}</>
  );
}
function useLookups() {
  return useLoad<InventoryLookups>("/lookups");
}
function label(
  labels: InventoryLookups | undefined,
  type: string | null,
  id: string | null,
) {
  if (!id) return "—";
  const list =
    type === "DEPOT"
      ? labels?.depots
      : type === "USER"
        ? labels?.users
        : labels?.organizations;
  return list?.find((r) => r.id === id)?.name ?? id;
}
function Unsaved({ dirty }: { dirty: boolean }) {
  const { blocker } = useUnsavedChanges(dirty);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Discard unsaved changes?"
      message="You have unsaved inventory edits. Keep editing or discard them to leave."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
    />
  );
}
const statusOptions = [
  "RECEIVED",
  "AVAILABLE",
  "RESERVED",
  "ALLOCATED",
  "DISPATCHED",
  "IN_TRANSIT",
  "AT_VENDOR",
  "UNDER_MAINTENANCE",
  "DAMAGED",
  "RETURNED",
  "INACTIVE",
];
export function InventoryPage() {
  useDocumentTitle("Inventory");
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="fg-inventory">
      <PageTitle
        title="Inventory management"
        description="Availability, custody, reservations and reconciliation. New vehicles enter inventory during registration."
        actions={hasPermission('fleet:manage') && hasPermission('inventory:manage') ? <Button type="button" size="lg" className="fg-inventory__register" leftIcon={<Icon name="fleet" size={18} />} onClick={() => navigate('/inventory/vehicles/new')}>Register vehicle</Button> : undefined}
        breadcrumbs={[
          { label: "FleetGo", to: "/dashboard" },
          { label: "Inventory" },
        ]}
      />
      <nav className="fg-inventory__tabs" aria-label="Inventory sections">
        {[
          ["", "Overview"],
          ["vehicles", "Vehicles"],
          ["reservations", "Reservations"],
          ["movements", "Movements"],
          ["reconciliations", "Reconciliation"],
          ["reports", "Reports"],
          ...(hasPermission("inventory:manage")
            ? [
                ["import", "Bulk import"],
                ["transfer", "Transfer"],
              ]
            : []),
        ].map(([path, title]) => (
          <NavLink
            key={path}
            end={path === ""}
            to={`/inventory${path ? "/" + path : ""}`}
          >
            {title}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="vehicles" element={<InventoryList />} />
        <Route path="vehicles/new" element={<RequirePermission anyOf={['fleet:manage']}><RequirePermission anyOf={['inventory:manage']}><VehicleFormPage /></RequirePermission></RequirePermission>} />
        <Route path="vehicles/:id" element={<VehicleWorkspace />}>
          <Route index element={<RequirePermission anyOf={['fleet:read']}><VehicleDetailsPage /></RequirePermission>} />
          <Route path="stock" element={<Details />} />
          <Route path="edit" element={<RequirePermission anyOf={['fleet:manage']}><VehicleFormPage /></RequirePermission>} />
        </Route>
        <Route path="receive" element={<Navigate to="/inventory/vehicles/new" replace />} />
        <Route
          path="import"
          element={
            <Manage>
              <BulkImport />
            </Manage>
          }
        />
        <Route path="reservations" element={<Reservations />} />
        <Route path="movements" element={<Movements />} />
        <Route
          path="transfer"
          element={
            <Manage>
              <Transfer />
            </Manage>
          }
        />
        <Route path="reconciliations" element={<Reconciliations />} />
        <Route path="reconciliations/:id" element={<ReconciliationDetails />} />
        <Route path="reports" element={<Reports />} />
        <Route
          path="*"
          element={
            <ErrorState
              title="Inventory page not found"
              action={<Link to="/inventory">Back to overview</Link>}
            />
          }
        />
      </Routes>
    </div>
  );
}
function Manage({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  return hasPermission("inventory:manage") ? (
    <>{children}</>
  ) : (
    <ErrorState title="Inventory management access required" />
  );
}
function Dashboard() {
  const state = useLoad<InventoryDashboard>("/dashboard");
  const data = state.data;
  const cards = [
    ["Total inventory", data?.total],
    [
      "Available",
      data?.byStatus.find((r) => r.label === "AVAILABLE")?.count ?? 0,
    ],
    [
      "Reserved",
      data?.byStatus.find((r) => r.label === "RESERVED")?.count ?? 0,
    ],
    [
      "Allocated",
      data?.byStatus.find((r) => r.label === "ALLOCATED")?.count ?? 0,
    ],
    [
      "In transit",
      data?.byStatus.find((r) => r.label === "IN_TRANSIT")?.count ?? 0,
    ],
    ["At vendors", data?.atVendors ?? 0],
    [
      "Under maintenance",
      data?.byStatus.find((r) => r.label === "UNDER_MAINTENANCE")?.count ?? 0,
    ],
    ["Damaged", data?.byStatus.find((r) => r.label === "DAMAGED")?.count ?? 0],
  ];
  return (
    <LoadBoundary {...state} retry={state.load}>
      <div className="fg-inventory__heading">
        <h2>Inventory at a glance</h2>
        <Button variant="secondary" onClick={state.load}>
          Refresh
        </Button>
      </div>
      <div className="fg-inventory__metrics">
        {cards.map(([title, count]) => (
          <Card key={title} title={title}>
            <strong>{count}</strong>
          </Card>
        ))}
      </div>
      {data ? (
        <div className="fg-inventory__charts">
          {[
            ["Inventory by depot", data.byDepot],
            ["Inventory by vendor", data.byVendor],
            ["Inventory by vehicle type", data.byType],
            ["Movement summary", data.movements],
          ].map(([title, values]) => (
            <Card key={String(title)} title={String(title)}>
              <BarChart data={values as ChartDatum[]} />
            </Card>
          ))}
          <Card title="Inventory by status">
            <DonutChart
              data={data.byStatus.map((r) => ({
                ...r,
                label: statusLabel(r.label as VehicleStatus),
                color: STATUS_COLORS[r.label as VehicleStatus],
              }))}
            />
          </Card>
        </div>
      ) : null}
    </LoadBoundary>
  );
}
function VehicleWorkspace() {
  const { id } = useParams();
  return <>
    <nav className="fg-inventory__tabs" aria-label="Vehicle sections">
      <NavLink end to={`/inventory/vehicles/${id}`}>Vehicle details</NavLink>
      <NavLink to={`/inventory/vehicles/${id}/stock`}>Stock &amp; custody</NavLink>
    </nav>
    <Outlet />
  </>;
}

function InventoryList() {
  const navigate = useNavigate();
  const [url] = useSearchParams();
  const lookups = useLookups();
  const [filters, setFilters] = useState<Record<string, string>>({
    search: "",
    status: url.get("status") ?? "",
    depotId: "",
    vendorId: "",
    organizationId: "",
    typeId: "",
    available: "",
    receivedFrom: "",
    receivedTo: "",
    sortBy: "updatedAt",
    sortDir: "desc",
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InventoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const params = JSON.stringify(filters);
  const query = useCallback(
    () =>
      Object.fromEntries(
        Object.entries(JSON.parse(params) as Record<string, string>)
          .filter(([, v]) => v)
          .map(([k, v]) => [
            k,
            k === "receivedFrom" || k === "receivedTo" ? toIso(v) : v,
          ]),
      ),
    [params],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.list<InventoryRecord>({
        ...query(),
        page,
        pageSize: 20,
      });
      setRows(result.data);
      setTotal(result.meta.total);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  const change = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const columns: Column<InventoryRecord>[] = [
    {
      key: "code",
      header: "Vehicle ID",
      render: (r) => (
        <Link to={`/inventory/vehicles/${r.vehicleId}`}>
          {r.vehicle.vehicleCode}
        </Link>
      ),
    },
    {
      key: "reg",
      header: "Registration",
      render: (r) => r.vehicle.registrationNumber,
    },
    {
      key: "make",
      header: "Make / model",
      render: (r) =>
        [r.vehicle.make?.name, r.vehicle.model?.name]
          .filter(Boolean)
          .join(" ") || "—",
    },
    { key: "type", header: "Type", render: (r) => r.vehicle.type?.name ?? "—" },
    { key: "depot", header: "Depot", render: (r) => r.currentDepotName ?? "—" },
    {
      key: "custodian",
      header: "Custodian",
      render: (r) => r.currentCustodianName ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusBadge
          tone={
            r.vehicle.status === "DAMAGED"
              ? "danger"
              : r.vehicle.status === "AVAILABLE"
                ? "success"
                : "neutral"
          }
        >
          {statusLabel(r.vehicle.status)}
        </StatusBadge>
      ),
    },
    {
      key: "movement",
      header: "Last movement",
      render: (r) => date(r.lastMovementAt),
    },
    { key: "updated", header: "Updated", render: (r) => date(r.updatedAt) },
  ];
  const exportAll = async () => {
    setExporting(true);
    setError("");
    try {
      const all: InventoryRecord[] = [];
      let next = 1,
        count = 0;
      do {
        const out = await api.list<InventoryRecord>({
          ...query(),
          page: next++,
          pageSize: 200,
        });
        count = out.meta.total;
        all.push(...out.data);
        if (!out.data.length && all.length < count)
          throw new Error("Inventory changed during export. Retry.");
      } while (all.length < count);
      downloadCsv(
        all.map((r) => ({
          vehicleId: r.vehicle.vehicleCode,
          registration: r.vehicle.registrationNumber,
          make: r.vehicle.make?.name,
          model: r.vehicle.model?.name,
          type: r.vehicle.type?.name,
          depot: r.currentDepotName,
          custodian: r.currentCustodianName,
          status: r.vehicle.status,
          lastMovement: r.lastMovementAt,
          updatedAt: r.updatedAt,
        })),
        "fleetgo-inventory.csv",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="fg-inventory__heading">
        <h2>Vehicle inventory</h2>
        <Button
          variant="secondary"
          loading={exporting}
          onClick={exportAll}
          disabled={!total}
        >
          Export all matching
        </Button>
      </div>
      <Feedback error={error || lookups.error} />
      <Card flush>
        <div className="fg-inventory__filters">
          <FormInput
            label="Search"
            placeholder="Vehicle ID, registration or VIN"
            value={filters.search}
            onChange={(e) => change("search", e.target.value)}
          />
          {[
            ["depotId", "Depot", lookups.data?.depots],
            [
              "vendorId",
              "Vendor",
              lookups.data?.organizations.filter((o) =>
                ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(o.type ?? ""),
              ),
            ],
            ["organizationId", "Organization", lookups.data?.organizations],
            ["typeId", "Vehicle type", lookups.data?.types],
          ].map(([key, title, values]) => (
            <Select
              key={String(key)}
              label={String(title)}
              value={filters[String(key)]}
              options={[
                { label: "All", value: "" },
                ...((values ?? []) as Lookup[]).map((v) => ({
                  label: v.name,
                  value: v.id,
                })),
              ]}
              onChange={(e) => change(String(key), e.target.value)}
            />
          ))}
          <Select
            label="Status"
            value={filters.status}
            options={[
              { label: "All statuses", value: "" },
              ...statusOptions.map((s) => ({ label: friendly(s), value: s })),
            ]}
            onChange={(e) => change("status", e.target.value)}
          />
          <Select
            label="Availability"
            value={filters.available}
            options={[
              { label: "Any", value: "" },
              { label: "Available", value: "true" },
              { label: "Unavailable", value: "false" },
            ]}
            onChange={(e) => change("available", e.target.value)}
          />
          <FormInput
            type="datetime-local"
            label="Received from"
            value={filters.receivedFrom}
            onChange={(e) => change("receivedFrom", e.target.value)}
          />
          <FormInput
            type="datetime-local"
            label="Received to"
            value={filters.receivedTo}
            onChange={(e) => change("receivedTo", e.target.value)}
          />
          <Select
            label="Sort by"
            value={filters.sortBy}
            options={[
              "updatedAt",
              "receivedAt",
              "lastMovementAt",
              "registrationNumber",
              "vehicleCode",
              "status",
            ].map((s) => ({
              label: {
                updatedAt: "Last updated",
                receivedAt: "Received date",
                lastMovementAt: "Last movement",
                registrationNumber: "Registration",
                vehicleCode: "Vehicle ID",
                status: "Status",
              }[s]!,
              value: s,
            }))}
            onChange={(e) => change("sortBy", e.target.value)}
          />
          <Select
            label="Direction"
            value={filters.sortDir}
            options={[
              { label: "Descending", value: "desc" },
              { label: "Ascending", value: "asc" },
            ]}
            onChange={(e) => change("sortDir", e.target.value)}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({
                search: "",
                status: "",
                depotId: "",
                vendorId: "",
                organizationId: "",
                typeId: "",
                available: "",
                receivedFrom: "",
                receivedTo: "",
                sortBy: "updatedAt",
                sortDir: "desc",
              });
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        </div>
        {error ? (
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        ) : null}
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(row) => navigate(`/inventory/vehicles/${row.vehicleId}`)}
          emptyTitle="No matching inventory"
          emptyDescription="Adjust filters, or choose Register vehicle to add a car to inventory."
        />
        <Pagination
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}
function CustodianFields({
  data,
  set,
  lookups,
}: {
  data: Record<string, string>;
  set: (k: string, v: string) => void;
  lookups: InventoryLookups;
}) {
  const choices =
    data.custodianType === "DEPOT"
      ? lookups.depots
      : data.custodianType === "USER"
        ? lookups.users
        : lookups.organizations.filter(
            (o) =>
              data.custodianType !== "VENDOR" ||
              ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(o.type ?? ""),
          );
  return (
    <>
      <Select
        label="Custodian type"
        required
        value={data.custodianType}
        options={["DEPOT", "VENDOR", "ORGANIZATION", "USER"].map((v) => ({
          label: friendly(v),
          value: v,
        }))}
        onChange={(e) => {
          set("custodianType", e.target.value);
          set("custodianId", "");
        }}
      />
      <Select
        label="Current custodian"
        required
        value={data.custodianId}
        options={options(choices)}
        onChange={(e) => set("custodianId", e.target.value)}
      />
    </>
  );
}
function EvidenceList({
  files,
  reload,
  path,
}: {
  files: Evidence[];
  reload: () => void;
  path: string;
}) {
  const { hasPermission } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      await api.upload(path, file);
      reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Feedback error={error} />
      <ul className="fg-inventory__evidence">
        {files.map((f) => (
          <li key={f.id}>
            <Button
              variant="ghost"
              onClick={() =>
                void api
                  .download(`/evidence/${f.id}/download`, f.fileName)
                  .catch((e) => setError(message(e)))
              }
            >
              {f.fileName}
            </Button>
            <span>{date(f.createdAt)}</span>
          </li>
        ))}
      </ul>
      {!files.length ? <p>No evidence uploaded.</p> : null}
      {hasPermission("inventory:manage") ? (
        <FormInput
          label="Upload photo or document"
          type="file"
          disabled={busy}
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      ) : null}
      {busy ? <Spinner label="Uploading…" /> : null}
    </>
  );
}
function MovementTable({
  rows,
  labels,
}: {
  rows: Movement[];
  labels: InventoryLookups;
}) {
  return (
    <ol className="fg-inventory__timeline">
      {rows.map((r) => (
        <li key={r.id}>
          <div>
            <strong>{friendly(r.type)}</strong>
            <time>{date(r.occurredAt)}</time>
          </div>
          <p>
            {label(labels, "DEPOT", r.fromDepotId)} →{" "}
            {label(labels, "DEPOT", r.toDepotId)}
          </p>
          <p>
            Custody: {label(labels, r.fromCustodianType, r.fromCustodianId)} →{" "}
            {label(labels, r.toCustodianType, r.toCustodianId)}
          </p>
          <p>
            By {label(labels, "USER", r.initiatedById)} · {r.reason}
            {r.reference ? ` · Ref: ${r.reference}` : ""}
          </p>
          {r.remarks ? <p>{r.remarks}</p> : null}
        </li>
      ))}
      {!rows.length ? <li>No movements recorded.</li> : null}
    </ol>
  );
}
function Details() {
  const { id } = useParams();
  const state = useLoad<InventoryDetails>(`/vehicles/${id}`);
  const d = state.data;
  const { hasPermission } = useAuth();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState("");
  const [evidenceMovement, setEvidenceMovement] = useState("");
  const check = async () => {
    try {
      const result = await api.get<{ available: boolean; reasons: string[] }>(
        `/vehicles/${id}/availability`,
      );
      setAvailability(
        result.available
          ? "Available for reservation"
          : result.reasons.join("; "),
      );
    } catch (e) {
      setError(message(e));
    }
  };
  const change = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/vehicles/${id}/status`, { status: target, reason });
      setConfirm(false);
      setTarget("");
      setReason("");
      setNotice("Inventory status updated.");
      state.load();
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <LoadBoundary {...state} retry={state.load}>
      {d ? (
        <>
          <div className="fg-inventory__heading">
            <div>
              <h2>
                {d.vehicle.vehicleCode} · {d.vehicle.registrationNumber}
              </h2>
              <p>
                {statusLabel(d.vehicle.status)} ·{" "}
                {label(d.labels, "DEPOT", d.currentDepotId)} ·{" "}
                {label(d.labels, d.currentCustodianType, d.currentCustodianId)}
              </p>
            </div>
            <Button variant="secondary" onClick={state.load}>
              Refresh profile
            </Button>
          </div>
          <Feedback error={error} success={notice} />
          <div className="fg-inventory__charts">
            <Card title="Identity and initial receiving">
              <dl className="fg-inventory__facts">
                {Object.entries({
                  VIN: d.vehicle.vin ?? "—",
                  Make: d.vehicle.make?.name ?? "—",
                  Model: d.vehicle.model?.name ?? "—",
                  Type: d.vehicle.type?.name ?? "—",
                  "Received at": date(d.receivedAt),
                  "Received from": label(
                    d.labels,
                    "ORGANIZATION",
                    d.receivedFromOrgId,
                  ),
                  "Receiving depot": label(
                    d.labels,
                    "DEPOT",
                    d.receivingDepotId,
                  ),
                  Condition: d.initialCondition,
                  Odometer: d.odometer ?? "Not recorded",
                  Accessories: d.accessories ?? "Not recorded",
                  Remarks: d.remarks ?? "—",
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Current availability">
              <p>
                Current status: <strong>{statusLabel(d.vehicle.status)}</strong>
              </p>
              <p>Depot: {label(d.labels, "DEPOT", d.currentDepotId)}</p>
              <p>
                Custodian:{" "}
                {label(d.labels, d.currentCustodianType, d.currentCustodianId)}
              </p>
              <div className="fg-inventory__actions">
                <Button variant="secondary" onClick={check}>
                  Check availability
                </Button>
                {hasPermission("inventory:reserve") ? (
                  <Link to={`/inventory/reservations?vehicleId=${id}`}>
                    Reserve this vehicle
                  </Link>
                ) : null}
                {hasPermission("inventory:manage") ? (
                  <Link to={`/inventory/transfer?vehicleId=${id}`}>
                    Transfer
                  </Link>
                ) : null}
              </div>
              {availability ? (
                <p role="status" className="fg-feedback">
                  {availability}
                </p>
              ) : null}
              {hasPermission("inventory:manage") ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setConfirm(true);
                  }}
                  className="fg-inventory__stack"
                >
                  <Select
                    label="Change condition / status"
                    required
                    value={target}
                    options={[
                      { label: "Select…", value: "" },
                      ...[
                        "AVAILABLE",
                        "UNDER_MAINTENANCE",
                        "DAMAGED",
                        "INACTIVE",
                      ].map((s) => ({ label: friendly(s), value: s })),
                    ]}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                  <FormInput
                    label="Reason"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button type="submit">Review status change</Button>
                  <p>
                    Only valid transitions are accepted. Reservation and
                    allocation use dedicated operations.
                  </p>
                </form>
              ) : null}
            </Card>
            <Card title="Reservations">
              <ReservationTable rows={d.reservations} labels={d.labels} />
            </Card>
            <Card title="Assignment details">
              {d.allocations.length ? (
                d.allocations.map((a) => (
                  <p key={a.id}>
                    {label(d.labels, "ORGANIZATION", a.organizationId)} ·{" "}
                    {a.reference} · {a.releasedAt ? "Released" : "Active"}
                  </p>
                ))
              ) : (
                <p>
                  No inventory allocation recorded. Allocation orchestration is
                  a future phase.
                </p>
              )}
            </Card>
            <Card title="Movement evidence" subtitle="Optional evidence for stock operations. Registration files are available in Vehicle details.">
              <Select
                label="Attach evidence to"
                value={evidenceMovement}
                options={[
                  { label: "Receiving / general vehicle evidence", value: "" },
                  ...d.movements.map((m) => ({
                    label: `${friendly(m.type)} ? ${date(m.occurredAt)}`,
                    value: m.id,
                  })),
                ]}
                onChange={(e) => setEvidenceMovement(e.target.value)}
              />
              <EvidenceList
                files={d.photos}
                reload={state.load}
                path={`/vehicles/${id}/evidence${evidenceMovement ? `?movementId=${evidenceMovement}` : ""}`}
              />
              {d.documents.length ? (
                <p>
                  Registration documents:{" "}
                  <Link to={`/inventory/vehicles/${id}`}>
                    Open vehicle documents ({d.documents.length})
                  </Link>
                </p>
              ) : null}
            </Card>
            <Card title="Custody history">
              <ul className="fg-inventory__evidence">
                {d.custody.map((c) => (
                  <li key={c.id}>
                    {label(d.labels, c.custodianType, c.custodianId)}
                    <span>
                      {date(c.fromDate)} —{" "}
                      {c.toDate ? date(c.toDate) : "Current"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title="Chronological movement history">
            <MovementTable rows={d.movements} labels={d.labels} />
          </Card>
          <Card title="Reconciliation and approved adjustments">
            <ul className="fg-inventory__evidence">
              {d.reconciliationItems.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/inventory/reconciliations/${i.reconciliation.id}`}
                  >
                    {i.reconciliation.scope} reconciliation ·{" "}
                    {friendly(i.result)}
                  </Link>
                  <span>{i.reconciliation.status}</span>
                </li>
              ))}
            </ul>
            {!d.reconciliationItems.length ? (
              <p>No reconciliation history.</p>
            ) : null}
            {d.adjustments.map((a) => (
              <p key={a.id}>
                {friendly(a.type)}: {a.fromValue} → {a.toValue} · {a.reason} ·{" "}
                {date(a.createdAt)}
              </p>
            ))}
          </Card>
          <ConfirmDialog
            open={confirm}
            title="Change inventory status?"
            message={`Set this vehicle to ${friendly(target)}? Reason: ${reason}`}
            onConfirm={change}
            onCancel={() => !busy && setConfirm(false)}
            loading={busy}
          />
        </>
      ) : null}
    </LoadBoundary>
  );
}
function ReservationTable({
  rows,
  labels,
  onCancel,
}: {
  rows: Reservation[];
  labels: InventoryLookups;
  onCancel?: (r: Reservation) => void;
}) {
  const cols: Column<Reservation>[] = [
    {
      key: "vehicle",
      header: "Vehicle",
      render: (r) => (
        <Link to={`/inventory/vehicles/${r.vehicleId}`}>
          {r.vehicleId.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "org",
      header: "Requesting organization",
      render: (r) => label(labels, "ORGANIZATION", r.requestingOrgId),
    },
    {
      key: "dates",
      header: "Period",
      render: (r) => (
        <>
          {date(r.startDate)}
          <br />
          {date(r.endDate)}
        </>
      ),
    },
    { key: "purpose", header: "Purpose", render: (r) => r.purpose },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <>
          {friendly(r.status)}
          {r.cancelReason ? <p>{r.cancelReason}</p> : null}
        </>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) =>
        onCancel && r.status === "ACTIVE" ? (
          <Button variant="ghost" onClick={() => onCancel(r)}>
            Cancel reservation
          </Button>
        ) : null,
    },
  ];
  return (
    <DataTable
      columns={cols}
      rows={rows}
      rowKey={(r) => r.id}
      emptyTitle="No reservations"
    />
  );
}
function useInventoryChoices() {
  const [rows, setRows] = useState<InventoryRecord[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all: InventoryRecord[] = [];
        let page = 1,
          total = 0;
        do {
          const out = await api.list<InventoryRecord>({
            page: page++,
            pageSize: 200,
          });
          total = out.meta.total;
          all.push(...out.data);
          if (!out.data.length) break;
        } while (all.length < total);
        if (active) setRows(all);
      } catch (e) {
        if (active) setError(message(e));
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { rows, error };
}
function Reservations() {
  const state = useLoad<Reservation[]>("/reservations");
  const lookup = useLookups();
  const choices = useInventoryChoices();
  const [params] = useSearchParams();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Record<string, string>>({
    vehicleId: params.get("vehicleId") ?? "",
    requestingOrgId: "",
    depotId: "",
    startDate: nowLocal(),
    endDate: "",
    purpose: "",
  });
  const [cancel, setCancel] = useState<Reservation | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const key = useRef(crypto.randomUUID());
  const set = (k: string, v: string) => {
    key.current = crypto.randomUUID();
    setDirty(true);
    setData((f) => ({ ...f, [k]: v }));
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        "/reservations",
        {
          ...data,
          startDate: toIso(data.startDate),
          endDate: toIso(data.endDate),
        },
        "post",
        key.current,
      );
      setSuccess("Reservation created. Vehicle is no longer available.");
      setConfirm(false);
      setDirty(false);
      state.load();
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const cancelReservation = async () => {
    if (!cancel) return;
    setBusy(true);
    setError("");
    try {
      await api.mutate(`/reservations/${cancel.id}/cancel`, { reason });
      setCancel(null);
      setReason("");
      setSuccess("Reservation cancelled; availability restored.");
      state.load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Feedback
        error={error || lookup.error || choices.error}
        success={success}
      />
      {hasPermission("inventory:reserve") && lookup.data ? (
        <Card
          title="Reserve a vehicle"
          subtitle="A reservation blocks availability immediately, including future-dated reservations."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (new Date(data.endDate) <= new Date(data.startDate)) {
                setError("End must follow start.");
                return;
              }
              setConfirm(true);
            }}
          >
            <div className="fg-inventory__form-grid">
              <Select
                label="Vehicle"
                required
                value={data.vehicleId}
                options={[
                  { label: "Select…", value: "" },
                  ...choices.rows.map((r) => ({
                    label: `${r.vehicle.vehicleCode} · ${r.vehicle.registrationNumber} · ${statusLabel(r.vehicle.status)}`,
                    value: r.vehicleId,
                  })),
                ]}
                onChange={(e) => {
                  set("vehicleId", e.target.value);
                  set(
                    "depotId",
                    choices.rows.find((r) => r.vehicleId === e.target.value)
                      ?.currentDepotId ?? "",
                  );
                }}
              />
              <Select
                label="Requesting organization"
                required
                options={options(lookup.data.organizations)}
                value={data.requestingOrgId}
                onChange={(e) => set("requestingOrgId", e.target.value)}
              />
              <Select
                label="Intended depot"
                required
                options={options(lookup.data.depots)}
                value={data.depotId}
                onChange={(e) => set("depotId", e.target.value)}
              />
              <FormInput
                label="Start"
                type="datetime-local"
                required
                value={data.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
              <FormInput
                label="End"
                type="datetime-local"
                required
                value={data.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
              <FormInput
                label="Purpose"
                required
                value={data.purpose}
                onChange={(e) => set("purpose", e.target.value)}
              />
              <FormInput
                label="Reference (optional)"
                value={data.reference ?? ""}
                onChange={(e) => set("reference", e.target.value)}
              />
            </div>
            <Button type="submit" loading={busy}>
              Review reservation
            </Button>
          </form>
        </Card>
      ) : null}
      <Select
        label="Reservation status"
        value={status}
        options={[
          { label: "All reservations", value: "" },
          ...["ACTIVE", "EXPIRED", "CANCELLED", "FULFILLED"].map((s) => ({
            label: friendly(s),
            value: s,
          })),
        ]}
        onChange={(e) => setStatus(e.target.value)}
      />
      <LoadBoundary {...state} retry={state.load}>
        {lookup.data ? (
          <Card title="Reservations">
            <ReservationTable
              rows={(state.data ?? []).filter(
                (r) => !status || r.status === status,
              )}
              labels={lookup.data}
              onCancel={
                hasPermission("inventory:reserve")
                  ? (r) => {
                      setCancel(r);
                      setReason("");
                    }
                  : undefined
              }
            />
          </Card>
        ) : null}
      </LoadBoundary>
      <ConfirmDialog
        open={confirm}
        title="Reserve this vehicle?"
        message="This vehicle will be unavailable to other reservations until cancellation, expiry or fulfillment."
        loading={busy}
        onConfirm={save}
        onCancel={() => !busy && setConfirm(false)}
      />
      {cancel ? (
        <Card title="Cancel reservation">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void cancelReservation();
            }}
          >
            <FormInput
              label="Cancellation reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="fg-inventory__actions">
              <Button type="submit" variant="danger" loading={busy}>
                Confirm cancellation
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setCancel(null)}
              >
                Keep reservation
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <Unsaved dirty={dirty} />
    </>
  );
}
function Transfer() {
  const lookup = useLookups();
  const choices = useInventoryChoices();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, string>>({
    vehicleId: params.get("vehicleId") ?? "",
    toDepotId: "",
    custodianType: "DEPOT",
    custodianId: "",
    type: "DEPOT_TRANSFER",
    occurredAt: nowLocal(),
    reason: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChanges(dirty);
  const key = useRef(crypto.randomUUID());
  const set = (k: string, v: string) => {
    setDirty(true);
    key.current = crypto.randomUUID();
    setData((f) => ({ ...f, [k]: v }));
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        "/transfers",
        {
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)),
          occurredAt: toIso(data.occurredAt),
        },
        "post",
        key.current,
      );
      setDirty(false);
      guard.allowNavigation();
      navigate(`/inventory/vehicles/${data.vehicleId}`);
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <LoadBoundary {...lookup} retry={lookup.load}>
      {lookup.data ? (
        <Card
          title="Record transfer or custody movement"
          subtitle="Reserved, allocated and dispatched vehicles cannot be transferred here. Historical movements are preserved."
        >
          <Feedback error={error || choices.error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            <fieldset disabled={busy}>
              <div className="fg-inventory__form-grid">
                <Select
                  label="Vehicle"
                  required
                  value={data.vehicleId}
                  options={[
                    { label: "Select…", value: "" },
                    ...choices.rows.map((r) => ({
                      label: `${r.vehicle.vehicleCode} · ${r.vehicle.registrationNumber}`,
                      value: r.vehicleId,
                    })),
                  ]}
                  onChange={(e) => set("vehicleId", e.target.value)}
                />
                <Select
                  label="Movement type"
                  required
                  value={data.type}
                  options={[
                    "DEPOT_TRANSFER",
                    "DEPOT_TO_VENDOR",
                    "VENDOR_TO_DEPOT",
                    "MAINTENANCE",
                    "CUSTODY_CHANGE",
                    "RETURN",
                  ].map((s) => ({ label: friendly(s), value: s }))}
                  onChange={(e) => set("type", e.target.value)}
                />
                <Select
                  label="Destination depot / location"
                  required
                  value={data.toDepotId}
                  options={options(lookup.data.depots)}
                  onChange={(e) => {
                    set("toDepotId", e.target.value);
                    if (data.custodianType === "DEPOT")
                      set("custodianId", e.target.value);
                  }}
                />
                <CustodianFields data={data} set={set} lookups={lookup.data} />
                <FormInput
                  label="Movement date and time"
                  type="datetime-local"
                  required
                  value={data.occurredAt}
                  onChange={(e) => set("occurredAt", e.target.value)}
                />
                <FormInput
                  label="Reason"
                  required
                  value={data.reason}
                  onChange={(e) => set("reason", e.target.value)}
                />
                <FormInput
                  label="Reference / ticket number"
                  value={data.reference ?? ""}
                  onChange={(e) => set("reference", e.target.value)}
                />
                <FormInput
                  label="Remarks"
                  value={data.remarks ?? ""}
                  onChange={(e) => set("remarks", e.target.value)}
                />
              </div>
              <Button type="submit">Review transfer</Button>
            </fieldset>
          </form>
          <p>
            Upload supporting evidence on the vehicle profile after recording
            the movement.
          </p>
          <ConfirmDialog
            open={confirm}
            title="Confirm inventory movement"
            message="This changes the vehicle’s current location and custody and creates a permanent movement record."
            onConfirm={save}
            onCancel={() => !busy && setConfirm(false)}
            loading={busy}
          />
          <ConfirmDialog
            open={guard.blocker.state === "blocked"}
            title="Discard transfer edits?"
            message="This transfer has not been saved."
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            onConfirm={() =>
              guard.blocker.state === "blocked" && guard.blocker.proceed()
            }
            onCancel={() =>
              guard.blocker.state === "blocked" && guard.blocker.reset()
            }
          />
        </Card>
      ) : null}
    </LoadBoundary>
  );
}
function Movements() {
  const choices = useInventoryChoices();
  const [vehicle, setVehicle] = useState("");
  return (
    <Card title="Vehicle movement history">
      <Feedback error={choices.error} />
      <Select
        label="Select vehicle"
        value={vehicle}
        options={[
          { label: "Select vehicle…", value: "" },
          ...choices.rows.map((r) => ({
            label: `${r.vehicle.vehicleCode} · ${r.vehicle.registrationNumber}`,
            value: r.vehicleId,
          })),
        ]}
        onChange={(e) => setVehicle(e.target.value)}
      />
      {vehicle ? (
        <MovementHistory key={vehicle} vehicle={vehicle} />
      ) : (
        <p>
          Choose a vehicle to view its permanent chronological movement ledger.
        </p>
      )}
    </Card>
  );
}
function MovementHistory({ vehicle }: { vehicle: string }) {
  const state = useLoad<InventoryDetails>(`/vehicles/${vehicle}`);
  return (
    <LoadBoundary {...state} retry={state.load}>
      {state.data ? (
        <MovementTable rows={state.data.movements} labels={state.data.labels} />
      ) : null}
    </LoadBoundary>
  );
}
function Reconciliations() {
  const state = useLoad<Reconciliation[]>("/reconciliations");
  const lookup = useLookups();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState("DEPOT");
  const [scopeId, setScopeId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const row = await api.mutate<{ id: string }>("/reconciliations", {
        scope,
        scopeId,
        notes,
      });
      setConfirm(false);
      navigate(`/inventory/reconciliations/${row.id}`);
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const cols: Column<Reconciliation>[] = [
    {
      key: "id",
      header: "Session",
      render: (r) => (
        <Link to={`/inventory/reconciliations/${r.id}`}>
          {r.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) =>
        `${friendly(r.scope)} · ${label(lookup.data ?? undefined, r.scope, r.scopeId)}`,
    },
    { key: "date", header: "Started", render: (r) => date(r.createdAt) },
    { key: "status", header: "Status", render: (r) => friendly(r.status) },
    { key: "notes", header: "Notes", render: (r) => r.notes ?? "—" },
  ];
  return (
    <>
      <Feedback error={error || lookup.error} />
      {hasPermission("inventory:manage") && lookup.data ? (
        <Card
          title="Start inventory reconciliation"
          subtitle="Take a snapshot, verify the physical inventory, then submit for independent review."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            <div className="fg-inventory__form-grid">
              <Select
                label="Scope type"
                value={scope}
                options={["DEPOT", "VENDOR", "ORGANIZATION"].map((s) => ({
                  label: friendly(s),
                  value: s,
                }))}
                onChange={(e) => {
                  setScope(e.target.value);
                  setScopeId("");
                }}
              />
              <Select
                label="Scope"
                required
                value={scopeId}
                options={options(
                  scope === "DEPOT"
                    ? lookup.data.depots
                    : lookup.data.organizations.filter(
                        (o) =>
                          scope !== "VENDOR" ||
                          ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(
                            o.type ?? "",
                          ),
                      ),
                )}
                onChange={(e) => setScopeId(e.target.value)}
              />
              <FormInput
                label="Session notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button type="submit" loading={busy}>
              Review snapshot creation
            </Button>
          </form>
        </Card>
      ) : null}
      <LoadBoundary {...state} retry={state.load}>
        <Card title="Reconciliation sessions">
          <DataTable
            columns={cols}
            rows={state.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No reconciliation sessions"
          />
        </Card>
      </LoadBoundary>
      <ConfirmDialog
        open={confirm}
        title="Create reconciliation snapshot?"
        message="The current system inventory will be recorded for physical verification."
        onConfirm={create}
        onCancel={() => !busy && setConfirm(false)}
        loading={busy}
      />
    </>
  );
}
function ReconciliationDetails() {
  const { id } = useParams();
  const state = useLoad<Reconciliation>(`/reconciliations/${id}`);
  const lookup = useLookups();
  const { hasPermission, user } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [comment, setComment] = useState("");
  const [unexpected, setUnexpected] = useState("");
  const [unexpectedReason, setUnexpectedReason] = useState("");
  const data = state.data;
  const mutate = async (path: string, body: unknown = {}) => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(path, body);
      setSuccess("Reconciliation updated.");
      setAction("");
      state.load();
    } catch (e) {
      setError(message(e));
      setAction("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <LoadBoundary {...state} retry={state.load}>
      {data ? (
        <>
          <div className="fg-inventory__heading">
            <h2>
              Reconciliation {data.id.slice(0, 8)} · {friendly(data.status)}
            </h2>
            <Button variant="secondary" onClick={state.load}>
              Refresh
            </Button>
          </div>
          <Feedback error={error || lookup.error} success={success} />
          <p>
            {friendly(data.scope)} ·{" "}
            {label(lookup.data ?? undefined, data.scope, data.scopeId)} ·{" "}
            {data.notes}
          </p>
          {data.reviewComment ? (
            <p className="fg-feedback">Review: {data.reviewComment}</p>
          ) : null}
          <div className="fg-inventory__metrics">
            {Object.entries(data.report).map(([k, v]) => (
              <Card key={k} title={k.replace(/([A-Z])/g, " $1")}>
                <strong>{v}</strong>
              </Card>
            ))}
          </div>
          <div className="fg-inventory__actions">
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  data.items.map((i) => ({
                    vehicle: i.vehicleRef ?? i.vehicleId,
                    result: i.result,
                    expectedDepot: label(
                      lookup.data ?? undefined,
                      "DEPOT",
                      i.expectedDepotId,
                    ),
                    observedDepot: label(
                      lookup.data ?? undefined,
                      "DEPOT",
                      i.observedDepotId,
                    ),
                    discrepancy: i.discrepancy,
                    remarks: i.remarks,
                  })),
                  "reconciliation-report.csv",
                )
              }
            >
              Download reconciliation report
            </Button>
          </div>
          <Card
            title="Physical verification"
            subtitle="Missing and unexpected vehicles are recorded for investigation. Only approved misplaced/damaged corrections update inventory."
          >
            {data.items.map((item) => (
              <ReconciliationRow
                key={item.id + data.updatedAt}
                item={item}
                labels={lookup.data ?? undefined}
                editable={
                  data.status === "DRAFT" && hasPermission("inventory:manage")
                }
                save={async (body) => {
                  await api.mutate(
                    `/reconciliations/${id}/items/${item.id}`,
                    body,
                    "put",
                  );
                  state.load();
                }}
              />
            ))}
            {!data.items.length ? (
              <p>No system-recorded vehicles in this scope.</p>
            ) : null}
            {data.status === "DRAFT" && hasPermission("inventory:manage") ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(`/reconciliations/${id}/items`, {
                    vehicleRef: unexpected,
                    result: "UNEXPECTED",
                    discrepancy: unexpectedReason,
                  });
                }}
                className="fg-inventory__stack"
              >
                <h3>Record an unexpected vehicle</h3>
                <FormInput
                  label="Registration / vehicle reference"
                  required
                  value={unexpected}
                  onChange={(e) => setUnexpected(e.target.value)}
                />
                <FormInput
                  label="Discrepancy details"
                  required
                  value={unexpectedReason}
                  onChange={(e) => setUnexpectedReason(e.target.value)}
                />
                <Button type="submit" loading={busy}>
                  Add unexpected vehicle
                </Button>
              </form>
            ) : null}
          </Card>
          <Card title="Verification photographs and documents">
            {data.status === "DRAFT" ? (
              <EvidenceList
                files={data.photos}
                reload={state.load}
                path={`/reconciliations/${id}/evidence`}
              />
            ) : (
              <ul>
                {data.photos.map((f) => (
                  <li key={f.id}>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void api
                          .download(`/evidence/${f.id}/download`, f.fileName)
                          .catch((e) => setError(message(e)))
                      }
                    >
                      {f.fileName}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {data.status === "DRAFT" && hasPermission("inventory:manage") ? (
            <Button
              disabled={busy || data.items.some((i) => i.result === "PENDING")}
              onClick={() => setAction("submit")}
            >
              Submit for review
            </Button>
          ) : null}
          {data.status === "SUBMITTED" && hasPermission("inventory:review") ? (
            <Card title="Independent review">
              <p>
                {user?.id === data.startedById
                  ? "A different authorized reviewer must review this session."
                  : "Approved corrections create adjustment and audit records. Submission alone does not change inventory."}
              </p>
              <FormInput
                label="Review comment"
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="fg-inventory__actions">
                <Button
                  disabled={!comment.trim() || user?.id === data.startedById}
                  onClick={() => setAction("APPROVED")}
                >
                  Approve corrections
                </Button>
                <Button
                  variant="danger"
                  disabled={!comment.trim() || user?.id === data.startedById}
                  onClick={() => setAction("REJECTED")}
                >
                  Reject
                </Button>
              </div>
            </Card>
          ) : null}
          <ConfirmDialog
            open={Boolean(action)}
            title={
              action === "submit"
                ? "Submit reconciliation?"
                : `${friendly(action)} reconciliation?`
            }
            message={
              action === "submit"
                ? "This locks physical verification for independent review."
                : "This review is permanent. Approval applies eligible corrections atomically; stale snapshots must be reconciled again."
            }
            onConfirm={() =>
              void mutate(
                action === "submit"
                  ? `/reconciliations/${id}/submit`
                  : `/reconciliations/${id}/review`,
                action === "submit" ? {} : { decision: action, comment },
              )
            }
            onCancel={() => !busy && setAction("")}
            loading={busy}
          />
        </>
      ) : null}
    </LoadBoundary>
  );
}
function ReconciliationRow({
  item,
  labels,
  editable,
  save,
}: {
  item: ReconciliationItem;
  labels: InventoryLookups | undefined;
  editable: boolean;
  save: (body: unknown) => Promise<void>;
}) {
  const [result, setResult] = useState(item.result);
  const [observed, setObserved] = useState(item.observedDepotId ?? "");
  const [discrepancy, setDiscrepancy] = useState(item.discrepancy ?? "");
  const [remarks, setRemarks] = useState(item.remarks ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="fg-inventory__recon-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await save({
            result,
            observedDepotId: observed || undefined,
            discrepancy,
            remarks,
          });
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>{item.vehicleRef ?? item.vehicleId}</strong>
      <p>
        Expected:{" "}
        {item.expectedStatus
          ? statusLabel(item.expectedStatus)
          : "Not in snapshot"}{" "}
        · {label(labels, "DEPOT", item.expectedDepotId)}
      </p>
      <Feedback error={error} />
      <fieldset disabled={!editable || busy}>
        <div className="fg-inventory__form-grid">
          <Select
            label="Physical result"
            value={result}
            options={(item.expectedStatus
              ? ["PENDING", "VERIFIED", "MISSING", "MISPLACED", "DAMAGED"]
              : ["UNEXPECTED"]
            ).map((s) => ({ label: friendly(s), value: s }))}
            onChange={(e) => setResult(e.target.value)}
          />
          <Select
            label="Observed depot"
            required={result === "MISPLACED"}
            value={observed}
            options={options(labels?.depots)}
            onChange={(e) => setObserved(e.target.value)}
          />
          <FormInput
            label="Discrepancy"
            required={[
              "MISSING",
              "MISPLACED",
              "DAMAGED",
              "UNEXPECTED",
            ].includes(result)}
            value={discrepancy}
            onChange={(e) => setDiscrepancy(e.target.value)}
          />
          <FormInput
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        {editable ? (
          <Button type="submit" variant="secondary" loading={busy}>
            Save verification
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
function BulkImport() {
  const lookup = useLookups();
  const [headers, setHeaders] = useState<string[]>([]);
  const [source, setSource] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState("");
  const [dirty, setDirty] = useState(false);
  const key = useRef(crypto.randomUUID());
  const columns = [
    "vehicleId",
    "vehicleCode",
    "registrationNumber",
    "vin",
    "makeId",
    "modelId",
    "typeId",
    "organizationId",
    "receivedAt",
    "receivedFromOrgId",
    "receivingDepotId",
    "custodianType",
    "custodianId",
    "initialCondition",
    "odometer",
    "accessories",
    "remarks",
  ];
  const mapped = () =>
    source.map((row) =>
      Object.fromEntries(
        Object.entries(mapping)
          .filter(([, from]) => from)
          .map(([to, from]) => [to, row[from]]),
      ),
    );
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    setPreview([]);
    setSummary("");
    try {
      const out = await api.upload<{
        headers: string[];
        rows: Record<string, unknown>[];
      }>("/import/file", file);
      setHeaders(out.headers);
      setSource(out.rows);
      setMapping(
        Object.fromEntries(
          columns.map((c) => [c, out.headers.includes(c) ? c : ""]),
        ),
      );
      key.current = crypto.randomUUID();
      setDirty(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api.mutate<ImportRow[]>("/import/validate", { rows: mapped() }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    setError("");
    try {
      const out = await api.mutate<{
        rows: ImportRow[];
        successful: number;
        failed: number;
        skipped: number;
      }>("/import/commit", { rows: mapped() }, "post", key.current);
      setPreview(out.rows);
      setSummary(
        `${out.successful} successful · ${out.failed} failed · ${out.skipped} skipped`,
      );
      setDirty(false);
      setConfirm(false);
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const cols: Column<ImportRow>[] = [
    { key: "row", header: "File row", render: (r) => r.row },
    { key: "status", header: "Result", render: (r) => r.status },
    {
      key: "vehicle",
      header: "Registration",
      render: (r) => String(r.input?.registrationNumber ?? "—"),
    },
    {
      key: "errors",
      header: "Validation details",
      render: (r) => r.errors.join("; ") || "Ready for import",
    },
  ];
  return (
    <>
      <Card
        title="Bulk Excel / CSV receipt import"
        subtitle="Map columns, validate every row, review results, then confirm. Maximum 1,000 rows; 5 MB file limit."
      >
        <Feedback error={error || lookup.error} success={summary} />
        <div className="fg-inventory__actions">
          <Button
            variant="secondary"
            onClick={() =>
              void api
                .download("/import/template", "fleetgo-inventory-template.xlsx")
                .catch((e) => setError(message(e)))
            }
          >
            Download Excel template
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(
                [
                  {
                    registrationNumber: "SYNTHETIC-001",
                    organizationId: "",
                    receivedAt: new Date().toISOString(),
                    receivedFromOrgId: "",
                    receivingDepotId: "",
                    custodianType: "DEPOT",
                    custodianId: "",
                    initialCondition: "GOOD",
                  },
                ],
                "fleetgo-inventory-template.csv",
              )
            }
          >
            Download CSV template
          </Button>
        </div>
        <FormInput
          label="Excel or CSV file"
          type="file"
          accept=".xlsx,.csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {source.length ? (
          <>
            <p>
              {source.length} source rows. Map required fields to columns;
              unmapped optional fields are omitted.
            </p>
            <div className="fg-inventory__form-grid">
              {columns.map((c) => (
                <Select
                  key={c}
                  label={c}
                  value={mapping[c] ?? ""}
                  options={[
                    { label: "Not mapped", value: "" },
                    ...headers.map((h) => ({ label: h, value: h })),
                  ]}
                  onChange={(e) => {
                    setMapping((m) => ({ ...m, [c]: e.target.value }));
                    setPreview([]);
                    setSummary("");
                    key.current = crypto.randomUUID();
                    setDirty(true);
                  }}
                />
              ))}
            </div>
            <div className="fg-inventory__actions">
              <Button loading={busy} onClick={validate}>
                Validate and preview
              </Button>
              {preview.some((r) => r.status === "READY") && !summary ? (
                <Button disabled={busy} onClick={() => setConfirm(true)}>
                  Review import
                </Button>
              ) : null}
              {preview.some((r) => r.errors.length) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadCsv(
                      preview
                        .filter((r) => r.errors.length)
                        .map((r) => ({
                          row: r.row,
                          status: r.status,
                          errors: r.errors.join("; "),
                        })),
                      "inventory-import-errors.csv",
                    )
                  }
                >
                  Download error report
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
        {busy ? <Spinner label="Processing import…" /> : null}
        {preview.length ? (
          <DataTable columns={cols} rows={preview} rowKey={(r) => r.row} />
        ) : null}
        <ConfirmDialog
          open={confirm}
          title="Import validated inventory?"
          message={`${preview.filter((r) => r.status === "READY").length} ready rows. Invalid and duplicate rows will be reported individually. Every row is checked again when imported.`}
          loading={busy}
          onConfirm={commit}
          onCancel={() => !busy && setConfirm(false)}
        />
      </Card>
      {lookup.data ? (
        <details className="fg-inventory__reference">
          <summary>Reference IDs for your import file</summary>
          {(
            [
              "depots",
              "organizations",
              "makes",
              "models",
              "types",
              "users",
            ] as const
          ).map((type) => (
            <div key={type}>
              <h3>{friendly(type)}</h3>
              <ul>
                {lookup.data![type].map((r) => (
                  <li key={r.id}>
                    {r.name} — <code>{r.id}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : null}
      <Unsaved dirty={dirty} />
    </>
  );
}
function Reports() {
  const state = useLoad<{
    inventory: InventoryDashboard;
    reconciliations: Reconciliation[];
  }>("/reports");
  const adjustments =
    useLoad<
      {
        id: string;
        vehicleId: string;
        type: string;
        fromValue: string;
        toValue: string;
        reason: string;
        createdAt: string;
      }[]
    >("/adjustments");
  return (
    <LoadBoundary {...state} retry={state.load}>
      {state.data ? (
        <>
          <Card
            title="Inventory report"
            subtitle="Database-derived current inventory and reconciliation session totals."
          >
            <div className="fg-inventory__actions">
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv(
                    state.data!.inventory.byStatus.map((r) => ({
                      status: friendly(r.label),
                      vehicles: r.count,
                    })),
                    "inventory-status-report.csv",
                  )
                }
              >
                Export status report
              </Button>
              <Link to="/inventory/vehicles">
                Export filtered vehicle inventory
              </Link>
            </div>
            <BarChart
              data={state.data.inventory.byStatus.map((r) => ({
                ...r,
                label: friendly(r.label),
                color: STATUS_COLORS[r.label as VehicleStatus],
              }))}
            />
            <p>
              Reconciliation sessions: {state.data.reconciliations.length}. Open
              a session to download its physical verification and discrepancy
              report.
            </p>
          </Card>
          <Card title="Auditable approved adjustments">
            <Feedback error={adjustments.error} />
            {adjustments.loading ? (
              <Spinner label="Loading adjustments…" />
            ) : (
              <DataTable
                columns={[
                  {
                    key: "vehicle",
                    header: "Vehicle",
                    render: (r) => (
                      <Link to={`/inventory/vehicles/${r.vehicleId}`}>
                        {r.vehicleId.slice(0, 8)}
                      </Link>
                    ),
                  },
                  {
                    key: "type",
                    header: "Correction",
                    render: (r) => friendly(r.type),
                  },
                  {
                    key: "change",
                    header: "Change",
                    render: (r) => `${r.fromValue} → ${r.toValue}`,
                  },
                  { key: "reason", header: "Reason", render: (r) => r.reason },
                  {
                    key: "date",
                    header: "Approved at",
                    render: (r) => date(r.createdAt),
                  },
                ]}
                rows={adjustments.data ?? []}
                rowKey={(r) => r.id}
                emptyTitle="No approved adjustments"
              />
            )}
          </Card>
        </>
      ) : null}
    </LoadBoundary>
  );
}
