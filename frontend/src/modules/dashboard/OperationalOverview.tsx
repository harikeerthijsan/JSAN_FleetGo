import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Card, DonutChart, Spinner } from "@/components";
import { reportsApi } from "@/services/reportsService";
import type {
  DashboardCharts,
  DashboardSummary,
  Monitoring,
} from "@/types/reports";
import "./OperationalOverview.css";

const PALETTE = ["#285a60", "#58a58c", "#d7af67", "#91aaa5", "#9189af", "#b27670", "#c98a3a"];
const withColor = (points: { label: string; count: number }[]) =>
  points.filter((p) => p.count > 0).map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] }));

/**
 * Phase 9 role-aware operational overview. Every figure is scoped server-side,
 * so a vendor/CTS user only ever sees their own organization's numbers.
 */
export function OperationalOverview() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      reportsApi.get<DashboardSummary>("/dashboard/summary"),
      reportsApi.get<DashboardCharts>("/dashboard/charts"),
      reportsApi.get<Monitoring>("/dashboard/monitoring"),
    ])
      .then(([s, c, m]) => {
        if (!active) return;
        setSummary(s);
        setCharts(c);
        setMonitoring(m);
      })
      .catch((e) => active && setError((e as { message?: string }).message ?? "Failed to load overview"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner block label="Loading operational overview…" />;
  if (error && !summary)
    return (
      <Card title="Operational overview">
        <p role="alert" className="fg-ov__error">{error}</p>
      </Card>
    );
  if (!summary) return null;

  const cards: { label: string; value: number; to: string }[] = [
    { label: "Total fleet", value: summary.totalFleet, to: "/reports/fleet" },
    { label: "Available", value: summary.available, to: "/fleet/vehicles?status=AVAILABLE" },
    { label: "Reserved", value: summary.reserved, to: "/fleet/vehicles?status=RESERVED" },
    { label: "Allocated", value: summary.allocated, to: "/fleet/vehicles?status=ALLOCATED" },
    { label: "In transit", value: summary.inTransit, to: "/tracking" },
    { label: "At vendors", value: summary.atVendor, to: "/fleet/vehicles?status=AT_VENDOR" },
    { label: "Under maintenance", value: summary.underMaintenance, to: "/fleet/vehicles?status=UNDER_MAINTENANCE" },
    { label: "Damaged", value: summary.damaged, to: "/fleet/vehicles?status=DAMAGED" },
    { label: "Active tickets", value: summary.activeTickets, to: "/tickets" },
    { label: "Pending approvals", value: summary.pendingApprovals, to: "/tickets" },
    { label: "Delayed trips", value: summary.delayedTrips, to: "/dispatch" },
    { label: "Completed deliveries", value: summary.completedDeliveries, to: "/reports/dispatch" },
  ];

  return (
    <section className="fg-ov" aria-label="Operational overview">
      <div className="fg-ov__section-label"><span>OPERATIONAL OVERVIEW</span></div>
      <div className="fg-ov__cards">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="fg-ov__card">
            <span className="fg-ov__value">{c.value}</span>
            <span className="fg-ov__label">{c.label}</span>
          </Link>
        ))}
      </div>

      {charts ? (
        <div className="fg-ov__charts">
          <Card title="Fleet by status">
            <DonutChart data={withColor(charts.fleetByStatus)} />
          </Card>
          <Card title="Delivery performance" subtitle="On-time vs delayed vs failed (from actual timestamps)">
            <BarChart data={withColor(charts.deliveryPerformance)} />
          </Card>
          <Card title="Tickets by status">
            <BarChart data={withColor(charts.ticketsByStatus)} />
          </Card>
          <Card title="Inventory by depot">
            <BarChart data={withColor(charts.inventoryByDepot)} />
          </Card>
        </div>
      ) : null}

      {monitoring ? (
        <Card title="Live operational monitoring" subtitle="Items needing attention, scoped to your access">
          <div className="fg-ov__monitor">
            <MonitorBlock
              title="Active trips"
              to="/dispatch"
              items={monitoring.activeTrips.map((t) => ({
                id: t.id,
                label: `${t.reference} · ${t.status}`,
                to: `/dispatch/trips/${t.id}`,
              }))}
            />
            <MonitorBlock
              title="Delayed / failed deliveries"
              to="/dispatch"
              items={monitoring.delayedDeliveries.map((t) => ({
                id: t.id,
                label: `${t.reference} · ${t.status}`,
                to: `/dispatch/trips/${t.id}`,
              }))}
            />
            <MonitorBlock
              title="Pending inspections"
              to="/inspections/list"
              items={monitoring.pendingInspections.map((i) => ({
                id: i.id,
                label: `${i.reference} · ${i.type} · ${i.status}`,
                to: `/inspections/${i.id}`,
              }))}
            />
            <MonitorBlock
              title="Unresolved damage"
              to="/inspections/discrepancies"
              items={monitoring.unresolvedDamage.map((d) => ({
                id: d.id,
                label: `${d.reference} · ${d.category} · ${d.severity}`,
                to: `/inspections/discrepancies/${d.id}`,
              }))}
            />
            <MonitorBlock
              title="Pending approvals"
              to="/tickets"
              items={monitoring.pendingApprovals.map((t) => ({
                id: t.id,
                label: `${t.ticketNumber} · ${t.priority}`,
                to: `/tickets/${t.id}`,
              }))}
            />
            <MonitorBlock
              title="Overdue tickets"
              to="/tickets"
              items={monitoring.overdueTickets.map((t) => ({
                id: t.id,
                label: `${t.ticketNumber} · ${t.subject ?? ""}`,
                to: `/tickets/${t.id}`,
              }))}
            />
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function MonitorBlock({
  title,
  to,
  items,
}: {
  title: string;
  to: string;
  items: { id: string; label: string; to: string }[];
}) {
  return (
    <div className="fg-ov__monitor-block">
      <h4>
        <Link to={to}>{title}</Link> <span className="fg-ov__badge">{items.length}</span>
      </h4>
      {items.length ? (
        <ul>
          {items.slice(0, 6).map((i) => (
            <li key={i.id}>
              <Link to={i.to}>{i.label}</Link>
            </li>
          ))}
          {items.length > 6 ? <li className="fg-ov__more">+{items.length - 6} more</li> : null}
        </ul>
      ) : (
        <p className="fg-ov__empty">Nothing pending.</p>
      )}
    </div>
  );
}
