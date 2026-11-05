import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, Link } from "react-router-dom";
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
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { reportsApi } from "@/services/reportsService";
import {
  REPORT_TYPES,
  type ReportExportRow,
  type ReportFilterValues,
  type ReportLookups,
  type ReportResult,
  type SavedReport,
} from "@/types/reports";
import "./Reports.css";

const errText = (e: unknown) => (e as { message?: string })?.message ?? "Request failed.";
const human = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());

function useLookups() {
  const [data, setData] = useState<ReportLookups | null>(null);
  useEffect(() => {
    reportsApi.get<ReportLookups>("/reports/lookups").then(setData).catch(() => setData(null));
  }, []);
  return data;
}

function FilterBar({
  lookups,
  value,
  onChange,
  showMode,
}: {
  lookups: ReportLookups | null;
  value: ReportFilterValues;
  onChange: (v: ReportFilterValues) => void;
  showMode?: boolean;
}) {
  const set = (k: keyof ReportFilterValues, v: string) => onChange({ ...value, [k]: v || undefined });
  return (
    <div className="fg-rep__filters">
      <FormInput label="From" type="date" value={value.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      <FormInput label="To" type="date" value={value.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      {lookups && lookups.isAdmin ? (
        <Select
          label="Organization"
          value={value.organizationId ?? ""}
          options={[{ label: "All", value: "" }, ...lookups.organizations.map((o) => ({ label: o.name, value: o.id }))]}
          onChange={(e) => set("organizationId", e.target.value)}
        />
      ) : null}
      <Select
        label="Depot"
        value={value.depotId ?? ""}
        options={[{ label: "All depots", value: "" }, ...(lookups?.depots ?? []).map((d) => ({ label: d.name, value: d.id }))]}
        onChange={(e) => set("depotId", e.target.value)}
      />
      <Select
        label="Vendor / transporter"
        value={value.vendorId ?? ""}
        options={[{ label: "All", value: "" }, ...(lookups?.vendors ?? []).map((v) => ({ label: v.name, value: v.id }))]}
        onChange={(e) => set("vendorId", e.target.value)}
      />
      {showMode ? (
        <Select
          label="GPS source"
          value={value.mode ?? "REAL"}
          options={[
            { label: "Real", value: "REAL" },
            { label: "Simulated", value: "SIMULATED" },
            { label: "All", value: "ALL" },
          ]}
          onChange={(e) => set("mode", e.target.value)}
        />
      ) : null}
    </div>
  );
}

function ReportView({
  category,
  type,
  lookups,
  title,
  showMode,
  extraControls,
}: {
  category: string;
  type: string;
  lookups: ReportLookups | null;
  title: string;
  showMode?: boolean;
  extraControls?: ReactNode;
}) {
  const [filters, setFilters] = useState<ReportFilterValues>(showMode ? { mode: "REAL" } : {});
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const linkFor = REPORT_TYPES.find((r) => r.category === category && r.type === type)?.moduleLink;

  const load = useCallback(() => {
    setLoading(true);
    reportsApi
      .data(category, type, filters, page, 25)
      .then((r) => {
        setResult(r);
        setError("");
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [category, type, filters, page]);
  useEffect(load, [load]);

  const save = async () => {
    const name = window.prompt("Save this report configuration as:");
    if (!name) return;
    try {
      await reportsApi.mutate("/reports/saved", { name, category, reportType: type, filters });
      window.alert("Saved. Find it under Saved Reports.");
    } catch (e) {
      window.alert(errText(e));
    }
  };

  const summaryEntries = result?.summary
    ? Object.entries(result.summary).filter(([, v]) => typeof v !== "object")
    : [];

  return (
    <Card title={title}>
      {extraControls}
      <FilterBar
        lookups={lookups}
        value={filters}
        onChange={(v) => {
          setFilters(v);
          setPage(1);
        }}
        showMode={showMode}
      />
      <div className="fg-rep__actions">
        <Button variant="secondary" onClick={() => reportsApi.export(category, type, "csv", filters)}>Export CSV</Button>
        <Button variant="secondary" onClick={() => reportsApi.export(category, type, "xlsx", filters)}>Export Excel</Button>
        <Button variant="secondary" onClick={() => reportsApi.export(category, type, "pdf", filters)}>Print / PDF</Button>
        {user ? <Button variant="ghost" onClick={save}>Save configuration</Button> : null}
      </div>
      {error ? <p role="alert" className="fg-rep__error">{error}</p> : null}
      {summaryEntries.length ? (
        <div className="fg-rep__summary">
          {summaryEntries.map(([k, v]) => (
            <div key={k} className="fg-rep__metric">
              <span className="fg-rep__metric-value">{v === null ? "—" : String(v)}</span>
              <span className="fg-rep__metric-label">{human(k)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {loading && !result ? (
        <Spinner block label="Loading report…" />
      ) : result ? (
        <>
          <DataTable
            columns={result.columns.map((c, idx) => ({
              key: c.key,
              header: c.header,
              render: (row: Record<string, unknown>) =>
                idx === 0 && linkFor && row.id ? (
                  <Link to={linkFor(String(row.id))}>{String(row[c.key] ?? "—")}</Link>
                ) : (
                  String(row[c.key] ?? "—")
                ),
            }))}
            rows={result.rows}
            rowKey={(r: Record<string, unknown>) => String(r.id ?? r[result.columns[0].key])}
            loading={loading}
            emptyTitle="No records"
            emptyDescription="No data matches the selected filters."
          />
          <Pagination page={page} pageSize={25} total={result.total} onPageChange={setPage} />
          {result.note ? <p className="fg-rep__note">{result.note}</p> : null}
        </>
      ) : null}
    </Card>
  );
}

function ReportBuilder({ lookups }: { lookups: ReportLookups | null }) {
  const [sel, setSel] = useState(`${REPORT_TYPES[0].category}:${REPORT_TYPES[0].type}`);
  const [category, type] = sel.split(":");
  const label = REPORT_TYPES.find((r) => `${r.category}:${r.type}` === sel)?.label ?? sel;
  return (
    <Card title="Report builder" subtitle="Choose a report, apply filters, view and export. Save reusable configurations.">
      <Select
        label="Report"
        value={sel}
        options={REPORT_TYPES.map((r) => ({ label: r.label, value: `${r.category}:${r.type}` }))}
        onChange={(e) => setSel(e.target.value)}
      />
      <ReportView key={sel} category={category} type={type} lookups={lookups} title={label} showMode={category === "gps"} />
    </Card>
  );
}

function SavedReports({ lookups }: { lookups: ReportLookups | null }) {
  const [rows, setRows] = useState<SavedReport[]>([]);
  const [active, setActive] = useState<SavedReport | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    reportsApi.get<SavedReport[]>("/reports/saved").then(setRows).catch((e) => setError(errText(e)));
  }, []);
  useEffect(load, [load]);
  const remove = async (id: string) => {
    if (!window.confirm("Delete this saved report?")) return;
    await reportsApi.mutate(`/reports/saved/${id}`, {}, "delete");
    setActive(null);
    load();
  };
  return (
    <>
      <Card title="Saved reports">
        {error ? <p role="alert" className="fg-rep__error">{error}</p> : null}
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (r: SavedReport) => <button className="fg-rep__linkbtn" onClick={() => setActive(r)}>{r.name}</button> },
            { key: "category", header: "Category", render: (r: SavedReport) => human(r.category) },
            { key: "reportType", header: "Type", render: (r: SavedReport) => human(r.reportType) },
            { key: "shared", header: "Shared", render: (r: SavedReport) => (r.isShared ? "Yes" : "No") },
            { key: "actions", header: "", render: (r: SavedReport) => <Button variant="ghost" onClick={() => remove(r.id)}>Delete</Button> },
          ]}
          rows={rows}
          rowKey={(r: SavedReport) => r.id}
          emptyTitle="No saved reports"
          emptyDescription="Save a configuration from any report or the builder."
        />
      </Card>
      {active ? (
        <ReportView key={active.id} category={active.category} type={active.reportType} lookups={lookups} title={active.name} showMode={active.category === "gps"} />
      ) : null}
    </>
  );
}

function ExportHistory() {
  const [rows, setRows] = useState<ReportExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    reportsApi
      .list<ReportExportRow>("/reports/exports", { page, pageSize: 25 })
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
      })
      .finally(() => setLoading(false));
  }, [page]);
  return (
    <Card title="Export history" subtitle="Generated exports and scheduled-report runs, scoped to your access.">
      <DataTable
        columns={[
          { key: "createdAt", header: "When", render: (r: ReportExportRow) => new Date(r.createdAt).toLocaleString() },
          { key: "category", header: "Category", render: (r: ReportExportRow) => human(r.category) },
          { key: "reportType", header: "Type", render: (r: ReportExportRow) => human(r.reportType) },
          { key: "format", header: "Format", render: (r: ReportExportRow) => r.format },
          { key: "rowCount", header: "Rows", render: (r: ReportExportRow) => (r.rowCount ?? "—") },
          {
            key: "status",
            header: "Status",
            render: (r: ReportExportRow) => (
              <StatusBadge tone={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>
                {human(r.status)}
              </StatusBadge>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r: ReportExportRow) => r.id}
        loading={loading}
        emptyTitle="No exports yet"
      />
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />
    </Card>
  );
}

export function ReportsPage() {
  useDocumentTitle("Reports");
  const lookups = useLookups();
  const [invType, setInvType] = useState("current");
  const [inspType, setInspType] = useState("all");

  const tabs = useMemo(
    () => [
      ["", "Fleet"],
      ["inventory", "Inventory"],
      ["tickets", "Tickets & approvals"],
      ["dispatch", "Dispatch & delivery"],
      ["gps", "GPS tracking"],
      ["inspections", "Inspection & damage"],
      ["vendors", "Vendor performance"],
      ["builder", "Report builder"],
      ["saved", "Saved reports"],
      ["exports", "Export history"],
    ],
    [],
  );

  return (
    <div className="fg-rep">
      <PageTitle title="Reports & analytics" description="Operational reporting drawn directly from FleetGo modules, scoped to your access." />
      <nav className="fg-rep__tabs" aria-label="Report sections">
        {tabs.map(([p, label]) => (
          <NavLink key={p} end={p === ""} to={`/reports${p ? "/" + p : ""}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<ReportView category="fleet" type="vehicles" lookups={lookups} title="Fleet performance" />} />
        <Route
          path="inventory"
          element={
            <ReportView
              key={invType}
              category="inventory"
              type={invType}
              lookups={lookups}
              title="Inventory report"
              extraControls={
                <Select
                  label="Inventory report"
                  value={invType}
                  options={[
                    { label: "Current inventory", value: "current" },
                    { label: "CTS receipts", value: "receipts" },
                  ]}
                  onChange={(e) => setInvType(e.target.value)}
                />
              }
            />
          }
        />
        <Route path="tickets" element={<ReportView category="tickets" type="all" lookups={lookups} title="Ticket & approval report" />} />
        <Route path="dispatch" element={<ReportView category="dispatch" type="deliveries" lookups={lookups} title="Dispatch & delivery performance" />} />
        <Route path="gps" element={<ReportView category="gps" type="sessions" lookups={lookups} title="GPS tracking report" showMode />} />
        <Route
          path="inspections"
          element={
            <ReportView
              key={inspType}
              category="inspections"
              type={inspType}
              lookups={lookups}
              title="Inspection & damage report"
              extraControls={
                <Select
                  label="Inspection report"
                  value={inspType}
                  options={[
                    { label: "Inspections", value: "all" },
                    { label: "Damage & discrepancies", value: "discrepancies" },
                  ]}
                  onChange={(e) => setInspType(e.target.value)}
                />
              }
            />
          }
        />
        <Route path="vendors" element={<ReportView category="vendors" type="performance" lookups={lookups} title="Vendor & transporter performance" />} />
        <Route path="builder" element={<ReportBuilder lookups={lookups} />} />
        <Route path="saved" element={<SavedReports lookups={lookups} />} />
        <Route path="exports" element={<ExportHistory />} />
      </Routes>
    </div>
  );
}
