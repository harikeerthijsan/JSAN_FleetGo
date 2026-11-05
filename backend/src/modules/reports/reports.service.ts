import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import { inventoryScope } from "../inventory/inventory.service";
import { dispatchScope } from "../operations/operations.service";
import { inspectionScope } from "../inspections/inspections.service";

/**
 * Phase 9 — reporting/aggregation service.
 *
 * Reads existing modules as the single source of truth via database
 * aggregation (groupBy / count / aggregate) — never loading whole tables into
 * memory, never duplicating business logic. Every query is scoped to the
 * caller's role and organization so vendors/CTS users only ever see their own
 * data. Metric definitions are documented in docs/PHASE9_REPORTING.md.
 */

const ADMIN = ["SUPER_ADMIN", "JSAN_ADMIN"];
const isAdmin = (a: AuthenticatedUser) => ADMIN.includes(a.role.name);
const isVendor = (a: AuthenticatedUser) =>
  a.organizationType === "VEHICLE_VENDOR" ||
  a.organizationType === "TRANSPORT_PARTNER";
const org = (a: AuthenticatedUser) => a.organizationId ?? "__none__";

/** Vehicle-level scope mirroring inventory custody/organization isolation. */
function vehicleScope(a: AuthenticatedUser): Prisma.VehicleWhereInput {
  if (isAdmin(a)) return {};
  if (isVendor(a))
    return {
      OR: [
        { vendorId: org(a) },
        { inventory: { currentCustodianType: "VENDOR", currentCustodianId: org(a) } },
      ],
    };
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [
        { depotId: { in: a.depotIds } },
        { inventory: { currentDepotId: { in: a.depotIds } } },
      ],
    };
  return {
    OR: [{ organizationId: org(a) }, { inventory: { receivedFromOrgId: org(a) } }],
  };
}

function ticketScope(a: AuthenticatedUser): Prisma.TicketWhereInput {
  if (isAdmin(a)) return {};
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [{ sourceDepotId: { in: a.depotIds } }, { requestingOrgId: org(a) }],
    };
  return { requestingOrgId: org(a) };
}

function discrepancyScope(a: AuthenticatedUser): Prisma.VehicleDiscrepancyWhereInput {
  if (isAdmin(a)) return {};
  if (isVendor(a)) return { organizationId: org(a) };
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [
        { reportedById: a.id },
        { assignedReviewerId: a.id },
        { inspection: { depotId: { in: a.depotIds } } },
      ],
    };
  return { OR: [{ organizationId: org(a) }, { reportedById: a.id }] };
}

export interface ReportFilters {
  from?: string;
  to?: string;
  organizationId?: string;
  depotId?: string;
  vendorId?: string;
  transporterId?: string;
  vehicleTypeId?: string;
  status?: string;
  mode?: string;
}

/** Inclusive date window on a given field (server-side, UTC ISO). */
function dateFilter(f: ReportFilters): { gte?: Date; lte?: Date } | undefined {
  if (!f.from && !f.to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (f.from) range.gte = new Date(f.from);
  if (f.to) {
    const end = new Date(f.to);
    // If a plain date was supplied, include the whole day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) end.setUTCHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

function groupMap<T extends { _count: number | { _all: number } }>(
  rows: (T & Record<string, unknown>)[],
  key: string,
): Record<string, number> {
  return Object.fromEntries(
    rows.map((r) => [
      String(r[key]),
      typeof r._count === "number" ? r._count : r._count._all,
    ]),
  );
}

function toChart(map: Record<string, number>, order?: string[]) {
  const labels = order ?? Object.keys(map);
  return labels
    .filter((k) => map[k] !== undefined)
    .map((k) => ({ label: k, count: map[k] }))
    .concat(
      Object.keys(map)
        .filter((k) => !labels.includes(k))
        .map((k) => ({ label: k, count: map[k] })),
    );
}

const VEHICLE_STATUSES = [
  "REGISTERED",
  "RECEIVED",
  "AVAILABLE",
  "RESERVED",
  "ALLOCATED",
  "DISPATCHED",
  "IN_TRANSIT",
  "AT_VENDOR",
  "DELIVERED",
  "UNDER_MAINTENANCE",
  "DAMAGED",
  "RETURNED",
  "INACTIVE",
];
// Utilization business rule: a vehicle is "utilized" only when actively
// committed to an operation. Registered/received/available/reserved/inactive
// vehicles are NOT utilized (reserved is explicitly excluded per requirements).
const UTILIZED = ["ALLOCATED", "DISPATCHED", "IN_TRANSIT", "AT_VENDOR"];

export const reportsService = {
  async lookups(a: AuthenticatedUser) {
    const [depots, organizations, vehicleTypes] = await Promise.all([
      prisma.depot.findMany({
        where:
          isAdmin(a) || a.role.name !== "OPERATIONS_MANAGER"
            ? { status: "ACTIVE" }
            : { status: "ACTIVE", id: { in: a.depotIds } },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      prisma.vehicleType.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      depots,
      organizations,
      vendors: organizations.filter((o) =>
        ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(o.type),
      ),
      vehicleTypes,
      role: a.role.name,
      isAdmin: isAdmin(a),
    };
  },

  // -------------------------------------------------------------------------
  // Main dashboard
  // -------------------------------------------------------------------------
  async dashboardSummary(a: AuthenticatedUser) {
    const vScope = vehicleScope(a);
    const tScope = ticketScope(a);
    const dScope = await dispatchScope(a);
    const [byStatusRows, ticketOpen, pendingApprovals, delayedTrips, completed] =
      await Promise.all([
        prisma.vehicle.groupBy({ by: ["status"], where: vScope, _count: true }),
        prisma.ticket.count({
          where: {
            AND: [tScope, { status: { in: ["SUBMITTED", "PENDING_APPROVAL", "IN_PROGRESS", "INFO_REQUIRED", "ON_HOLD"] } }],
          },
        }),
        prisma.ticket.count({
          where: { AND: [tScope, { approvalStatus: { in: ["PENDING", "INFO_REQUESTED"] } }] },
        }),
        prisma.trip.count({
          where: { dispatch: dScope, status: { in: ["DELAYED", "FAILED_DELIVERY"] } },
        }),
        prisma.trip.count({ where: { dispatch: dScope, status: "DELIVERED" } }),
      ]);
    const byStatus = groupMap(byStatusRows as never[], "status");
    const at = (s: string) => byStatus[s] ?? 0;
    const total = Object.values(byStatus).reduce((x, y) => x + y, 0);
    return {
      totalFleet: total,
      available: at("AVAILABLE"),
      reserved: at("RESERVED"),
      allocated: at("ALLOCATED"),
      inTransit: at("IN_TRANSIT") + at("DISPATCHED"),
      atVendor: at("AT_VENDOR"),
      underMaintenance: at("UNDER_MAINTENANCE"),
      damaged: at("DAMAGED"),
      activeTickets: ticketOpen,
      pendingApprovals,
      delayedTrips,
      completedDeliveries: completed,
      byStatus,
    };
  },

  async dashboardCharts(a: AuthenticatedUser) {
    const vScope = vehicleScope(a);
    const dScope = await dispatchScope(a);
    const tScope = ticketScope(a);
    const [
      byStatus,
      byType,
      byMake,
      invByDepot,
      invByVendor,
      ticketsByStatus,
      ticketsByPriority,
      dispatchByState,
      trips,
      inspByType,
      discByStatus,
    ] = await Promise.all([
      prisma.vehicle.groupBy({ by: ["status"], where: vScope, _count: true }),
      prisma.vehicle.groupBy({ by: ["typeId"], where: vScope, _count: true }),
      prisma.vehicle.groupBy({ by: ["makeId"], where: vScope, _count: true }),
      prisma.vehicleInventory.groupBy({
        by: ["currentDepotId"],
        where: { AND: [inventoryScope(a), { inInventory: true }] },
        _count: true,
      }),
      prisma.vehicleInventory.groupBy({
        by: ["currentCustodianId"],
        where: { AND: [inventoryScope(a), { currentCustodianType: "VENDOR" }] },
        _count: true,
      }),
      prisma.ticket.groupBy({ by: ["status"], where: tScope, _count: true }),
      prisma.ticket.groupBy({ by: ["priority"], where: tScope, _count: true }),
      prisma.dispatch.groupBy({ by: ["state"], where: dScope, _count: true }),
      prisma.trip.findMany({
        where: { dispatch: dScope, status: { in: ["DELIVERED", "DELAYED", "FAILED_DELIVERY"] } },
        select: {
          status: true,
          actualArrivalAt: true,
          dispatch: { select: { expectedDeliveryAt: true } },
        },
      }),
      prisma.vehicleInspection.groupBy({
        by: ["type"],
        where: inspectionScope(a),
        _count: true,
      }),
      prisma.vehicleDiscrepancy.groupBy({
        by: ["status"],
        where: discrepancyScope(a),
        _count: true,
      }),
    ]);

    // Resolve names for grouped foreign ids.
    const typeIds = (byType as { typeId: string | null }[]).map((r) => r.typeId).filter(Boolean) as string[];
    const makeIds = (byMake as { makeId: string | null }[]).map((r) => r.makeId).filter(Boolean) as string[];
    const depotIds = (invByDepot as { currentDepotId: string | null }[]).map((r) => r.currentDepotId).filter(Boolean) as string[];
    const vendorIds = (invByVendor as { currentCustodianId: string | null }[]).map((r) => r.currentCustodianId).filter(Boolean) as string[];
    const [types, makes, depots, vendors] = await Promise.all([
      prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }),
      prisma.vehicleMake.findMany({ where: { id: { in: makeIds } }, select: { id: true, name: true } }),
      prisma.depot.findMany({ where: { id: { in: depotIds } }, select: { id: true, name: true } }),
      prisma.organization.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }),
    ]);
    const nameOf = (list: { id: string; name: string }[], id: string | null, fallback: string) =>
      id ? (list.find((x) => x.id === id)?.name ?? fallback) : fallback;

    // On-time vs delayed (business rule): delivered on/before expected = on time.
    let onTime = 0,
      delayed = 0,
      failed = 0;
    for (const t of trips) {
      if (t.status === "FAILED_DELIVERY") failed++;
      else if (
        t.status === "DELIVERED" &&
        t.actualArrivalAt &&
        t.dispatch.expectedDeliveryAt &&
        t.actualArrivalAt <= t.dispatch.expectedDeliveryAt
      )
        onTime++;
      else delayed++;
    }

    return {
      fleetByStatus: toChart(groupMap(byStatus as never[], "status"), VEHICLE_STATUSES),
      vehiclesByType: (byType as { typeId: string | null; _count: number }[]).map((r) => ({
        label: nameOf(types, r.typeId, "Unspecified"),
        count: r._count,
      })),
      vehiclesByMake: (byMake as { makeId: string | null; _count: number }[]).map((r) => ({
        label: nameOf(makes, r.makeId, "Unspecified"),
        count: r._count,
      })),
      inventoryByDepot: (invByDepot as { currentDepotId: string | null; _count: number }[]).map((r) => ({
        label: nameOf(depots, r.currentDepotId, "Unassigned"),
        count: r._count,
      })),
      inventoryByVendor: (invByVendor as { currentCustodianId: string | null; _count: number }[]).map((r) => ({
        label: nameOf(vendors, r.currentCustodianId, "Unknown vendor"),
        count: r._count,
      })),
      ticketsByStatus: toChart(groupMap(ticketsByStatus as never[], "status")),
      ticketsByPriority: toChart(groupMap(ticketsByPriority as never[], "priority"), [
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
      ]),
      dispatchesByState: toChart(groupMap(dispatchByState as never[], "state"), [
        "PLANNED",
        "READY",
        "CONFIRMED",
        "CANCELLED",
      ]),
      deliveryPerformance: [
        { label: "On time", count: onTime },
        { label: "Delayed", count: delayed },
        { label: "Failed", count: failed },
      ],
      inspectionsByType: toChart(groupMap(inspByType as never[], "type")),
      discrepanciesByStatus: toChart(groupMap(discByStatus as never[], "status")),
    };
  },

  async monitoring(a: AuthenticatedUser, f: ReportFilters) {
    const dScope = await dispatchScope(a);
    const tScope = ticketScope(a);
    const now = new Date();
    const depotFilter = f.depotId ? { sourceDepotId: f.depotId } : {};
    const [activeTrips, delayed, pendingInspections, unresolvedDamage, pendingApprovals, overdueTickets] =
      await Promise.all([
        prisma.trip.findMany({
          where: {
            dispatch: { AND: [dScope, depotFilter] },
            status: { in: ["DISPATCHED", "IN_TRANSIT", "DELAYED", "DELIVERY_ATTEMPTED"] },
          },
          select: {
            id: true,
            reference: true,
            status: true,
            dispatch: { select: { id: true, reference: true } },
          },
          take: 100,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.trip.findMany({
          where: { dispatch: { AND: [dScope, depotFilter] }, status: { in: ["DELAYED", "FAILED_DELIVERY"] } },
          select: { id: true, reference: true, status: true },
          take: 100,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.vehicleInspection.findMany({
          where: { AND: [inspectionScope(a), { status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"] } }] },
          select: { id: true, reference: true, type: true, status: true, vehicleId: true },
          take: 100,
          orderBy: { createdAt: "desc" },
        }),
        prisma.vehicleDiscrepancy.findMany({
          where: { AND: [discrepancyScope(a), { status: { notIn: ["RESOLVED", "CLOSED"] } }] },
          select: { id: true, reference: true, category: true, severity: true, status: true },
          take: 100,
          orderBy: { createdAt: "desc" },
        }),
        prisma.ticket.findMany({
          where: { AND: [tScope, { approvalStatus: { in: ["PENDING", "INFO_REQUESTED"] } }] },
          select: { id: true, ticketNumber: true, subject: true, priority: true },
          take: 100,
          orderBy: { submittedAt: "desc" },
        }),
        prisma.ticket.findMany({
          where: {
            AND: [
              tScope,
              {
                OR: [
                  { approvalDueAt: { lt: now }, approvalStatus: { in: ["PENDING", "INFO_REQUESTED"] } },
                  { resolutionDueAt: { lt: now }, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"] } },
                ],
              },
            ],
          },
          select: { id: true, ticketNumber: true, subject: true, resolutionDueAt: true },
          take: 100,
          orderBy: { resolutionDueAt: "asc" },
        }),
      ]);
    return {
      activeTrips,
      delayedDeliveries: delayed,
      pendingInspections,
      unresolvedDamage,
      pendingApprovals,
      overdueTickets,
      counts: {
        activeTrips: activeTrips.length,
        delayedDeliveries: delayed.length,
        pendingInspections: pendingInspections.length,
        unresolvedDamage: unresolvedDamage.length,
        pendingApprovals: pendingApprovals.length,
        overdueTickets: overdueTickets.length,
      },
    };
  },

  // -------------------------------------------------------------------------
  // Tabular report datasets (power report screens, builder and exports)
  // -------------------------------------------------------------------------
  async dataset(
    category: string,
    type: string,
    f: ReportFilters,
    a: AuthenticatedUser,
    page = 1,
    pageSize = 50,
  ): Promise<ReportResult> {
    const fn = DATASETS[`${category}:${type}`] ?? DATASETS[category];
    if (!fn) throw ApiError.badRequest(`Unknown report: ${category}/${type}`);
    return fn({ f, a, page, pageSize });
  },
};

export interface ReportResult {
  title: string;
  columns: { key: string; header: string }[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, unknown>;
  note?: string;
}

interface Ctx {
  f: ReportFilters;
  a: AuthenticatedUser;
  page: number;
  pageSize: number;
}

const skip = (c: Ctx) => (c.page - 1) * c.pageSize;

function meta(c: Ctx, total: number, extra: Partial<ReportResult>): ReportResult {
  return {
    title: "",
    columns: [],
    rows: [],
    total,
    page: c.page,
    pageSize: c.pageSize,
    ...extra,
  } as ReportResult;
}

// Haversine distance (km) between two coordinates.
function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type DatasetFn = (c: Ctx) => Promise<ReportResult>;

const DATASETS: Record<string, DatasetFn> = {
  // ---- Fleet --------------------------------------------------------------
  "fleet:vehicles": async (c) => {
    const where: Prisma.VehicleWhereInput = {
      AND: [
        vehicleScope(c.a),
        c.f.status ? { status: c.f.status as never } : {},
        c.f.vehicleTypeId ? { typeId: c.f.vehicleTypeId } : {},
        c.f.depotId ? { depotId: c.f.depotId } : {},
        c.f.vendorId ? { vendorId: c.f.vendorId } : {},
      ],
    };
    const [rows, total, byStatus] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        select: {
          id: true,
          vehicleCode: true,
          registrationNumber: true,
          status: true,
          manufacturingYear: true,
          type: { select: { name: true } },
          make: { select: { name: true } },
          depot: { select: { name: true } },
          vendor: { select: { name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.vehicle.count({ where }),
      prisma.vehicle.groupBy({ by: ["status"], where, _count: true }),
    ]);
    const statusMap = groupMap(byStatus as never[], "status");
    const utilized = UTILIZED.reduce((s, k) => s + (statusMap[k] ?? 0), 0);
    return meta(c, total, {
      title: "Fleet vehicles",
      columns: [
        { key: "vehicleCode", header: "Code" },
        { key: "registrationNumber", header: "Registration" },
        { key: "status", header: "Status" },
        { key: "type", header: "Type" },
        { key: "make", header: "Make" },
        { key: "year", header: "Year" },
        { key: "depot", header: "Depot" },
        { key: "vendor", header: "Vendor" },
      ],
      rows: rows.map((v) => ({
        id: v.id,
        vehicleCode: v.vehicleCode,
        registrationNumber: v.registrationNumber,
        status: v.status,
        type: v.type?.name ?? "—",
        make: v.make?.name ?? "—",
        year: v.manufacturingYear ?? "—",
        depot: v.depot?.name ?? "—",
        vendor: v.vendor?.name ?? "—",
      })),
      summary: {
        total,
        utilized,
        utilizationPercent: total ? Math.round((utilized / total) * 1000) / 10 : 0,
        available: statusMap.AVAILABLE ?? 0,
        underMaintenance: statusMap.UNDER_MAINTENANCE ?? 0,
        damaged: statusMap.DAMAGED ?? 0,
      },
      note: "Utilization counts only ALLOCATED, DISPATCHED, IN_TRANSIT and AT_VENDOR vehicles. Registered/received/available/reserved/inactive vehicles are not utilized.",
    });
  },

  // ---- Inventory ----------------------------------------------------------
  "inventory:current": async (c) => {
    const where: Prisma.VehicleInventoryWhereInput = {
      AND: [
        inventoryScope(c.a),
        c.f.depotId ? { currentDepotId: c.f.depotId } : {},
        c.f.vendorId ? { currentCustodianType: "VENDOR", currentCustodianId: c.f.vendorId } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.vehicleInventory.findMany({
        where,
        select: {
          id: true,
          vehicleId: true,
          inInventory: true,
          currentDepotId: true,
          currentCustodianType: true,
          currentCustodianId: true,
          receivedAt: true,
          lastMovementAt: true,
          vehicle: { select: { vehicleCode: true, registrationNumber: true, status: true } },
        },
        orderBy: { lastMovementAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.vehicleInventory.count({ where }),
    ]);
    return meta(c, total, {
      title: "Current inventory",
      columns: [
        { key: "vehicleCode", header: "Code" },
        { key: "registrationNumber", header: "Registration" },
        { key: "status", header: "Status" },
        { key: "custodianType", header: "Custodian" },
        { key: "lastMovementAt", header: "Last movement" },
      ],
      rows: rows.map((r) => ({
        id: r.vehicleId,
        vehicleCode: r.vehicle.vehicleCode,
        registrationNumber: r.vehicle.registrationNumber,
        status: r.vehicle.status,
        custodianType: r.currentCustodianType ?? "—",
        lastMovementAt: r.lastMovementAt?.toISOString() ?? "—",
      })),
      summary: { total },
    });
  },

  "inventory:receipts": async (c) => {
    const range = dateFilter(c.f);
    const where: Prisma.VehicleReceiptWhereInput = {
      AND: [
        isAdmin(c.a) ? {} : { OR: [{ receivedFromOrgId: org(c.a) }, { receivingDepotId: { in: c.a.depotIds } }] },
        range ? { receivedAt: range } : {},
        c.f.depotId ? { receivingDepotId: c.f.depotId } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.vehicleReceipt.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.vehicleReceipt.count({ where }),
    ]);
    return meta(c, total, {
      title: "Vehicle receipts from CTS",
      columns: [
        { key: "vehicleId", header: "Vehicle" },
        { key: "receivedAt", header: "Received" },
        { key: "odometer", header: "Odometer" },
        { key: "initialCondition", header: "Condition" },
      ],
      rows: rows.map((r) => ({
        id: r.vehicleId,
        vehicleId: r.vehicleId,
        receivedAt: r.receivedAt.toISOString(),
        odometer: r.odometer ?? "—",
        initialCondition: r.initialCondition ?? "—",
      })),
      summary: { total },
    });
  },

  // ---- Tickets / approvals ------------------------------------------------
  "tickets:all": async (c) => {
    const range = dateFilter(c.f);
    const where: Prisma.TicketWhereInput = {
      AND: [
        ticketScope(c.a),
        range ? { createdAt: range } : {},
        c.f.organizationId ? { requestingOrgId: c.f.organizationId } : {},
        c.f.status ? { status: c.f.status as never } : {},
      ],
    };
    const [rows, total, byStatus, byPriority, agg] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: {
          id: true,
          ticketNumber: true,
          type: true,
          subject: true,
          priority: true,
          status: true,
          approvalStatus: true,
          submittedAt: true,
          finalApprovalAt: true,
          completedAt: true,
          approvalDueAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.ticket.count({ where }),
      prisma.ticket.groupBy({ by: ["status"], where, _count: true }),
      prisma.ticket.groupBy({ by: ["priority"], where, _count: true }),
      prisma.ticket.findMany({
        where: { AND: [where, { submittedAt: { not: null }, finalApprovalAt: { not: null } }] },
        select: { submittedAt: true, finalApprovalAt: true, completedAt: true, approvalDueAt: true },
      }),
    ]);
    // Average approval time (hours) and SLA compliance from real timestamps.
    let approvalMs = 0,
      approvalN = 0,
      slaMet = 0,
      slaN = 0;
    for (const t of agg) {
      if (t.submittedAt && t.finalApprovalAt) {
        approvalMs += t.finalApprovalAt.getTime() - t.submittedAt.getTime();
        approvalN++;
        if (t.approvalDueAt) {
          slaN++;
          if (t.finalApprovalAt <= t.approvalDueAt) slaMet++;
        }
      }
    }
    return meta(c, total, {
      title: "Tickets & approvals",
      columns: [
        { key: "ticketNumber", header: "Ticket" },
        { key: "type", header: "Type" },
        { key: "priority", header: "Priority" },
        { key: "status", header: "Status" },
        { key: "approvalStatus", header: "Approval" },
        { key: "createdAt", header: "Created" },
      ],
      rows: rows.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        type: t.type,
        priority: t.priority,
        status: t.status,
        approvalStatus: t.approvalStatus,
        createdAt: t.createdAt.toISOString(),
      })),
      summary: {
        total,
        byStatus: groupMap(byStatus as never[], "status"),
        byPriority: groupMap(byPriority as never[], "priority"),
        avgApprovalHours: approvalN ? Math.round((approvalMs / approvalN / 3_600_000) * 10) / 10 : null,
        slaCompliancePercent: slaN ? Math.round((slaMet / slaN) * 1000) / 10 : null,
      },
      note: "Average approval time and SLA compliance use submittedAt → finalApprovalAt vs approvalDueAt. Tickets without those timestamps are excluded from the averages.",
    });
  },

  // ---- Dispatch / delivery -----------------------------------------------
  "dispatch:deliveries": async (c) => {
    const dScope = await dispatchScope(c.a);
    const range = dateFilter(c.f);
    const where: Prisma.TripWhereInput = {
      dispatch: {
        AND: [dScope, c.f.transporterId ? { transporterId: c.f.transporterId } : {}, c.f.depotId ? { sourceDepotId: c.f.depotId } : {}],
      },
      ...(range ? { createdAt: range } : {}),
      ...(c.f.status ? { status: c.f.status as never } : {}),
    };
    const [rows, total, all] = await Promise.all([
      prisma.trip.findMany({
        where,
        select: {
          id: true,
          reference: true,
          status: true,
          actualStartAt: true,
          actualArrivalAt: true,
          dispatch: { select: { reference: true, expectedDeliveryAt: true, sourceDepotId: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.trip.count({ where }),
      prisma.trip.findMany({
        where,
        select: {
          status: true,
          actualStartAt: true,
          actualArrivalAt: true,
          dispatch: { select: { expectedDeliveryAt: true } },
        },
      }),
    ]);
    let delivered = 0,
      onTime = 0,
      delayed = 0,
      failed = 0,
      cancelled = 0,
      durMs = 0,
      durN = 0;
    for (const t of all) {
      if (t.status === "CANCELLED") cancelled++;
      else if (t.status === "FAILED_DELIVERY") failed++;
      else if (t.status === "DELIVERED") {
        delivered++;
        if (t.actualStartAt && t.actualArrivalAt) {
          durMs += t.actualArrivalAt.getTime() - t.actualStartAt.getTime();
          durN++;
        }
        if (t.actualArrivalAt && t.dispatch.expectedDeliveryAt && t.actualArrivalAt <= t.dispatch.expectedDeliveryAt)
          onTime++;
        else delayed++;
      } else if (t.status === "DELAYED") delayed++;
    }
    return meta(c, total, {
      title: "Dispatch & delivery performance",
      columns: [
        { key: "reference", header: "Trip" },
        { key: "dispatch", header: "Dispatch" },
        { key: "status", header: "Status" },
        { key: "actualStartAt", header: "Departed" },
        { key: "actualArrivalAt", header: "Arrived" },
        { key: "expectedDeliveryAt", header: "Expected" },
      ],
      rows: rows.map((t) => ({
        id: t.id,
        reference: t.reference,
        dispatch: t.dispatch.reference,
        status: t.status,
        actualStartAt: t.actualStartAt?.toISOString() ?? "—",
        actualArrivalAt: t.actualArrivalAt?.toISOString() ?? "—",
        expectedDeliveryAt: t.dispatch.expectedDeliveryAt?.toISOString() ?? "—",
      })),
      summary: {
        total,
        delivered,
        onTime,
        delayed,
        failed,
        cancelled,
        onTimePercent: delivered ? Math.round((onTime / delivered) * 1000) / 10 : null,
        avgDeliveryHours: durN ? Math.round((durMs / durN / 3_600_000) * 10) / 10 : null,
      },
      note: "On-time % = delivered on/before expected delivery ÷ delivered trips. Cancelled trips are excluded; failed attempts are reported separately and not counted as delivered.",
    });
  },

  // ---- GPS / tracking -----------------------------------------------------
  "gps:sessions": async (c) => {
    const dScope = await dispatchScope(c.a);
    const mode = (c.f.mode ?? "REAL").toUpperCase();
    const tripScope = await prisma.trip.findMany({
      where: { dispatch: dScope },
      select: { id: true },
    });
    const tripIds = tripScope.map((t) => t.id);
    const where: Prisma.TrackingSessionWhereInput = {
      tripId: { in: tripIds.length ? tripIds : ["__none__"] },
      ...(mode === "ALL" ? {} : { mode: mode as never }),
    };
    const [sessions, total] = await Promise.all([
      prisma.trackingSession.findMany({
        where,
        select: {
          id: true,
          mode: true,
          state: true,
          tripId: true,
          vehicleId: true,
          createdAt: true,
          lastGPSAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.trackingSession.count({ where }),
    ]);
    // Distance is computed only from recorded VALID/LOW fixes; never invented.
    const rows: Record<string, unknown>[] = [];
    for (const s of sessions) {
      const fixes = await prisma.gPSLocation.findMany({
        where: { sessionId: s.id, quality: { in: ["VALID", "LOW"] }, latitude: { not: null }, longitude: { not: null } },
        select: { latitude: true, longitude: true, gpsAt: true },
        orderBy: { gpsAt: "asc" },
      });
      let distance = 0;
      for (let i = 1; i < fixes.length; i++)
        distance += haversine(
          fixes[i - 1].latitude!,
          fixes[i - 1].longitude!,
          fixes[i].latitude!,
          fixes[i].longitude!,
        );
      rows.push({
        id: s.id,
        mode: s.mode,
        state: s.state,
        fixes: fixes.length,
        distanceKm: fixes.length >= 2 ? Math.round(distance * 100) / 100 : null,
        lastFixAt: s.lastGPSAt?.toISOString() ?? "—",
      });
    }
    return meta(c, total, {
      title: "GPS tracking sessions",
      columns: [
        { key: "id", header: "Session" },
        { key: "mode", header: "Source" },
        { key: "state", header: "State" },
        { key: "fixes", header: "Recorded fixes" },
        { key: "distanceKm", header: "Distance (km)" },
        { key: "lastFixAt", header: "Last fix" },
      ],
      rows,
      summary: {
        total,
        mode,
        realOnly: mode === "REAL",
      },
      note: "Distance is summed only from recorded VALID/LOW GPS fixes (≥2 required); it is never estimated from missing data. Source clearly distinguishes REAL from SIMULATED development data.",
    });
  },

  // ---- Inspections / damage ----------------------------------------------
  "inspections:all": async (c) => {
    const range = dateFilter(c.f);
    const where: Prisma.VehicleInspectionWhereInput = {
      AND: [
        inspectionScope(c.a),
        range ? { createdAt: range } : {},
        c.f.status ? { status: c.f.status as never } : {},
        c.f.depotId ? { depotId: c.f.depotId } : {},
      ],
    };
    const [rows, total, byType, byStatus] = await Promise.all([
      prisma.vehicleInspection.findMany({
        where,
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          vehicleId: true,
          registrationNumber: true,
          receivingOutcome: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.vehicleInspection.count({ where }),
      prisma.vehicleInspection.groupBy({ by: ["type"], where, _count: true }),
      prisma.vehicleInspection.groupBy({ by: ["status"], where, _count: true }),
    ]);
    const statusMap = groupMap(byStatus as never[], "status");
    const completed = (statusMap.APPROVED ?? 0) + (statusMap.COMPLETED ?? 0);
    return meta(c, total, {
      title: "Inspections",
      columns: [
        { key: "reference", header: "Reference" },
        { key: "type", header: "Type" },
        { key: "status", header: "Status" },
        { key: "registrationNumber", header: "Vehicle" },
        { key: "receivingOutcome", header: "Outcome" },
        { key: "createdAt", header: "Created" },
      ],
      rows: rows.map((i) => ({
        id: i.id,
        reference: i.reference,
        type: i.type,
        status: i.status,
        registrationNumber: i.registrationNumber ?? i.vehicleId,
        receivingOutcome: i.receivingOutcome ?? "—",
        createdAt: i.createdAt.toISOString(),
      })),
      summary: {
        total,
        byType: groupMap(byType as never[], "type"),
        completionRatePercent: total ? Math.round((completed / total) * 1000) / 10 : 0,
      },
    });
  },

  "inspections:discrepancies": async (c) => {
    const range = dateFilter(c.f);
    const where: Prisma.VehicleDiscrepancyWhereInput = {
      AND: [
        discrepancyScope(c.a),
        range ? { createdAt: range } : {},
        c.f.status ? { status: c.f.status as never } : {},
      ],
    };
    const [rows, total, byStatus, byCategory] = await Promise.all([
      prisma.vehicleDiscrepancy.findMany({
        where,
        select: {
          id: true,
          reference: true,
          category: true,
          severity: true,
          status: true,
          vehicleId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: skip(c),
        take: c.pageSize,
      }),
      prisma.vehicleDiscrepancy.count({ where }),
      prisma.vehicleDiscrepancy.groupBy({ by: ["status"], where, _count: true }),
      prisma.vehicleDiscrepancy.groupBy({ by: ["category"], where, _count: true }),
    ]);
    return meta(c, total, {
      title: "Damage & discrepancies",
      columns: [
        { key: "reference", header: "Reference" },
        { key: "category", header: "Category" },
        { key: "severity", header: "Severity" },
        { key: "status", header: "Status" },
        { key: "createdAt", header: "Reported" },
      ],
      rows: rows.map((d) => ({
        id: d.id,
        reference: d.reference,
        category: d.category,
        severity: d.severity,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      })),
      summary: {
        total,
        byStatus: groupMap(byStatus as never[], "status"),
        byCategory: groupMap(byCategory as never[], "category"),
      },
    });
  },

  // ---- Vendor / transporter performance ----------------------------------
  "vendors:performance": async (c) => {
    // Only admins and internal staff may see cross-vendor performance; vendors
    // see only their own organization row.
    const where: Prisma.OrganizationWhereInput = {
      type: { in: ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"] },
      status: "ACTIVE",
      ...(isAdmin(c.a) ? {} : { id: org(c.a) }),
      ...(c.f.vendorId ? { id: c.f.vendorId } : {}),
    };
    const vendors = await prisma.organization.findMany({
      where,
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
      skip: skip(c),
      take: c.pageSize,
    });
    const total = await prisma.organization.count({ where });
    const rows: Record<string, unknown>[] = [];
    for (const v of vendors) {
      const [custody, trips, openDiscrepancies, pendingInspections] = await Promise.all([
        prisma.vehicleInventory.count({
          where: { currentCustodianType: "VENDOR", currentCustodianId: v.id, inInventory: true },
        }),
        prisma.trip.findMany({
          where: { dispatch: { transporterId: v.id } },
          select: { status: true, actualStartAt: true, actualArrivalAt: true, dispatch: { select: { expectedDeliveryAt: true } } },
        }),
        prisma.vehicleDiscrepancy.count({
          where: { organizationId: v.id, status: { notIn: ["RESOLVED", "CLOSED"] } },
        }),
        prisma.vehicleInspection.count({
          where: { organizationId: v.id, type: "RECEIVING", status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED"] } },
        }),
      ]);
      let delivered = 0,
        onTime = 0,
        failed = 0,
        durMs = 0,
        durN = 0;
      for (const t of trips) {
        if (t.status === "FAILED_DELIVERY") failed++;
        else if (t.status === "DELIVERED") {
          delivered++;
          if (t.actualStartAt && t.actualArrivalAt) {
            durMs += t.actualArrivalAt.getTime() - t.actualStartAt.getTime();
            durN++;
          }
          if (t.actualArrivalAt && t.dispatch.expectedDeliveryAt && t.actualArrivalAt <= t.dispatch.expectedDeliveryAt)
            onTime++;
        }
      }
      rows.push({
        id: v.id,
        name: v.name,
        type: v.type,
        underCustody: custody,
        delivered,
        failed,
        onTimePercent: delivered ? Math.round((onTime / delivered) * 1000) / 10 : null,
        avgDeliveryHours: durN ? Math.round((durMs / durN / 3_600_000) * 10) / 10 : null,
        openDiscrepancies,
        pendingInspections,
      });
    }
    return meta(c, total, {
      title: "Vendor & transporter performance",
      columns: [
        { key: "name", header: "Organization" },
        { key: "type", header: "Type" },
        { key: "underCustody", header: "Under custody" },
        { key: "delivered", header: "Delivered" },
        { key: "failed", header: "Failed" },
        { key: "onTimePercent", header: "On-time %" },
        { key: "avgDeliveryHours", header: "Avg delivery (h)" },
        { key: "openDiscrepancies", header: "Open discrepancies" },
        { key: "pendingInspections", header: "Pending receiving" },
      ],
      rows,
      summary: { total },
      note: "Metrics are computed only from measurable records (custody, delivered/failed trips, discrepancies, pending inspections). No arbitrary rating or composite score is produced.",
    });
  },
};
